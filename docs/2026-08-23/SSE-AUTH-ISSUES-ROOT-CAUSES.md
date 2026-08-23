# SSE Auth Issues — Root Causes & Fixes

**Date:** 2026-08-23
**Scope:** Flags SSE 400 errors in wrangler dev + pre-existing typecheck/test failures surfaced while fixing them. All changes shipped in commit `1bdaad9 fix: flags and sse auth errors` plus the follow-up dedupe.

---

## 1. `GET /api/flags/stream` → 400 Bad Request (repeating)

### Symptom

```
[wrangler:info] GET  /api/flags/stream    400 Bad Request
[wrangler:info] GET  /api/flags/stream    400 Bad Request   ← every ~5 s, forever
[wrangler:info] POST /api/flags/evaluate  200 OK            ← same SDK, same page
[wrangler:info] POST /api/analytics/track 201 Created       ← same SDK, same page
```

Flag evaluation worked; only the SSE channel failed.

### Root cause chain

1. The browser SDK opened the stream with `new EventSource("/api/flags/stream")`
   (`packages/browser-sdk/src/modules/flags.ts`). The native `EventSource` API **cannot send
   custom headers**, so no `x-org-id` was attached.
2. Every other SDK call worked because the client injects the header on `fetch` via
   `getHeaders()` (`packages/client/src/platform/browser-observability.ts`) — that's why
   `/evaluate` returned 200 and `/analytics/track` returned 201.
3. At the edge, `resolveProxyOrgId` resolves org from path slug → Host → JWT → incoming
   header (`packages/workers/src/routes/proxy.ts`). For the SSE request all four were empty
   (no slug in path, host without a store subdomain, EventSource sends no JWT/header) →
   edge answered `400 "org id required (JWT, URL path, or Host)"` before the server ever
   saw the request.
4. Server-side the route independently requires a header org:
   `requireHeaderOrgId` (`packages/server/src/shared/org.ts`) returns
   `400 { error: "org id required" }`.
5. The SDK retried forever: `es.onerror` closed the connection and reconnected after 5 s.

### Fix — short-lived signed stream tickets (mirrors `/api/notifications/stream`)

EventSource can carry query params even though it can't carry headers, so:

| Step | Change | File |
| --- | --- | --- |
| Mint | New anonymous `POST /api/flags/stream/ticket` — a `fetch`, which *can* send headers; requires edge-signed `x-org-id`; returns `{ data: { ticket, expiresIn } }` (60 s TTL, HMAC-signed with `WORKER_SERVER_SECRET`, empty `userId` since flag streams are per-org) | `packages/server/src/domains/flags/routes/stream.ts` |
| Connect | `GET /stream?stream_ticket=…` verifies the ticket server-side and takes the org from it; falls back to `requireHeaderOrgId` when absent (edge-signed prod traffic) | same |
| Edge public route | `/api/flags/stream/ticket` added to `PUBLIC_POST_PATTERNS` | `packages/workers/src/routes/public-routes.ts` |
| Edge bypass | `isFlagsStreamWithTicket(url)` skips JWT resolution and the org-required 400 for ticket-carrying stream GETs — identical to the notifications-stream bypass | `packages/workers/src/routes/proxy.ts` |
| SDK | `connectSSE()` now mints a ticket first, then opens `new EventSource("/api/flags/stream?stream_ticket=…")`. On any failure (ticket or SSE error) it retries after 5 s, re-minting a fresh ticket each time so the 60 s TTL never lapses mid-handshake | `packages/browser-sdk/src/modules/flags.ts` |

Security model unchanged: tickets are only minted for an already-trusted org (edge-signed
header), are HMAC-signed, expire in 60 s, and grant access to that one org's flag events.
Identical trust model to notifications/collab stream tickets.

### Also fixed in the same route

The handler looped `while (true)` — it kept sleeping forever even after client disconnect.
Changed to `while (!stream.aborted)` so the handler actually exits once hono marks the
stream aborted (`packages/server/src/domains/flags/routes/stream.ts`).

### Tests

New `packages/server/src/domains/flags/routes/stream.test.ts` covers: ticket minting from
header org, SSE connect with valid ticket + **no** header org (the exact failing scenario),
invalid ticket → 401, expired ticket → 401, missing org/ticket → 400, unset secret → 503.
Edge coverage added in `public-routes.test.ts`.

---

## 2. Pre-existing failures found during verification

### 2a. Workers typecheck broken — dead `routes/api.ts`

- **Symptom:** `tsc --noEmit` in `@noname/workers` failed with
  `Property 'tenantId' does not exist on type 'EdgeContext'`.
- **Root cause:** `packages/workers/src/routes/api.ts` predated the tenant→org rename and
  referenced `ctx.tenantId`. It was dead code — the worker entry mounts only proxy +
  static + storefront routes; nothing imported `createApiRoutes`.
- **Fix:** Deleted the file.

### 2b. Workers typecheck broken — contract test in the wrong package

- **Symptom:** `TS6059 File … not under rootDir 'src'`, `TS2591 Cannot find name
  'node:crypto' / 'process' / 'Buffer'`.
- **Root cause:** `hmac.contract.test.ts` lived in `packages/workers/src` but imported
  server sources (`shared/org.ts`, `shared/tenant.ts`) by relative path. Server files use
  Node built-ins, incompatible with the workers package's worker-types-only tsconfig
  (`types: ["@cloudflare/workers-types"]`, `rootDir: "src"`).
- **Fix:** Moved to `packages/server/src/shared/hmac.contract.test.ts` where node types and
  the verification middleware live. It still imports the real edge signer straight from
  workers source, so both sides of the sign↔verify contract stay covered. Also fixed
  `noUncheckedIndexedAccess` issues in the moved test.

### 2c. `org.test.ts` expected a bypass that doesn't exist

- **Symptom:** `"allows requests without HMAC in dev when REQUIRE_EDGE_HMAC=false"` failed
  (401 ≠ 200).
- **Root cause:** Three tests described a `REQUIRE_EDGE_HMAC` dev escape hatch that was
  never implemented in `orgMiddleware`. Decision: strict edge-HMAC enforcement is the
  source of truth — no dev bypass anywhere.
- **Fix:** Removed the three stale tests; kept the two valid ones (no-secret allow,
  secret-set → 401).

### 2d. `resolve-slug.test.ts` — `DataError: Zero-length key is not supported`

- **Symptom:** `"fetches from API on cache miss and writes KV"` threw inside
  `crypto.subtle.importKey` via `getHmacKey`.
- **Root cause:** `resolve-slug.ts` intentionally changed to sign internal edge→API calls
  with `hmacHeaders(...)` (required because upstream `orgMiddleware` rejects unsigned calls
  when `WORKER_SERVER_SECRET` is set). The test's fake `Env` had no secret, and
  `TextEncoder().encode(undefined)` encodes an empty payload → zero-length HMAC key.
  Code is correct (source of truth); test was stale against the new contract.
- **Fix:** Test now provides `WORKER_SERVER_SECRET` in the fake Env and asserts the outbound
  fetch carries an `x-auth-hmac` header.

### 2e. `webhooks/service.test.ts` — 5 s test timeout under full-suite load

- **Symptom:** `"returns duplicate for same external event id"` timed out at 5 s in the
  full run but passed in isolation (12/12).
- **Root cause:** Tests dynamically `import("./service")`, pulling the BullMQ/ioredis-heavy
  module; under parallel-suite CPU contention the cold import exceeded vitest's default
  5 s `testTimeout`. Not a product bug.
- **Fix:** Explicit `{ timeout: 30_000 }` on the three tests that import `./service`.

---

## 3. Integration review findings (commit 1bdaad9)

Verified sound, no action needed:

- `fetchWithTimeout` clears its abort timer once response headers arrive — long-lived SSE
  proxied through the edge is never killed by the 10 s timeout.
- `strip-public-org` strips only the `orgId` query key; `stream_ticket` passes through.
- Ticket security matches the existing notifications pattern (signed, TTL-bound, org-bound).
- New `GET /api/flags/public` (concurrent work): registered before `/:id` so it isn't
  shadowed; public at the edge; `service.list("")` scopes to `orgId = ""` → returns `[]`,
  so an unresolvable org cannot leak other tenants' flags.
- Contract-test relocation keeps true two-sided verification under Node
  (`crypto.subtle`/`btoa` available).

Fixed during review:

- **Duplicate `/^\/api\/flags\/stream\/ticket$/` entry** in `PUBLIC_POST_PATTERNS` — my
  change and concurrent work both added the same regex. Removed one copy.

---

## Verification

- `vitest`: 140 files / 509 tests green.
- `tsc --noEmit`: `@noname/server`, `@noname/workers`, `@noname/browser-sdk` all clean.
- `biome check`: clean on all touched files.

## Key files

| Area | File |
| --- | --- |
| Flags SSE + tickets | `packages/server/src/domains/flags/routes/stream.ts` (+ `.test.ts`) |
| Edge public routes | `packages/workers/src/routes/public-routes.ts` |
| Edge proxy bypass | `packages/workers/src/routes/proxy.ts` |
| Browser SDK SSE | `packages/browser-sdk/src/modules/flags.ts` |
| Sign↔verify contract | `packages/server/src/shared/hmac.contract.test.ts` |
| Org middleware | `packages/server/src/shared/org.ts` |
