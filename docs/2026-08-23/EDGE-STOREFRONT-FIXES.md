# Edge Storefront 400/500 & Flags Access — Root Causes & Fixes

> **Status:** Fixed & verified locally (2026-08-23)
> **Scope:** `packages/workers`, `packages/server` (flags), `packages/client`, `packages/browser-sdk`
> **Related:** [`FLAGS-UI-LIVE-UPDATE-DECISION.md`](../2026-07-27/FLAGS-UI-LIVE-UPDATE-DECISION.md), [`ADMIN-PREVIEW-AND-FLAGS-SCOPE.md`](../2026-07-30/ADMIN-PREVIEW-AND-FLAGS-SCOPE.md), [`BROWSER_SDK.md`](../2026-07-11/BROWSER_SDK.md)

---

## Symptoms

Wrangler dev log showed, on every storefront page load at `yogastore.localhost:5173`:

```
GET  /api/flags/stream            400 Bad Request
POST /api/analytics/track         400 Bad Request
POST /api/analytics/replay        400 Bad Request
GET  /api/tenants/:slug/catalog    400 → later 500 Internal Server Error
GET  /api/edge/schema/:slug        400 → later 500 Internal Server Error
GET  /api/flags                   401 Unauthorized   (every visit)
Error: HTTP 400 http://yogastore.localhost:5173/login?redirect=%2F%3Fedit%3Dtrue
✘ [ERROR] Error: Network connection lost.
```

Pattern: only **anonymous storefront traffic** failed. Logged-in proxy traffic (`/api/tenants/resolve/*`, `/api/flags/evaluate`) returned 200.

---

## Root cause 1 — Unsigned internal edge→API call (all the 400s)

Server `.env` sets `WORKER_SERVER_SECRET`, so upstream `orgMiddleware`
(`packages/server/src/shared/org.ts`) rejects any request without a valid HMAC:
`401 "Request must come through edge worker"`.

The edge worker's own slug→org helper `resolveSiteId`
(`packages/workers/src/resolve-slug.ts`) fetched
`${API_ORIGIN}/api/tenants/resolve/:slug` **with no headers**:

1. Upstream returned 401 (unsigned).
2. `if (!res.ok) return null` swallowed it → org resolution returned null.
3. Proxy replied `400 "org id required (JWT, URL path, or Host)"`.

Everything that resolves org from **Host header or x-org-id** broke:
tenant catalog, edge schema, analytics track/replay (sendBeacon cannot carry
custom headers), flag SSE. Browser-proxied requests worked because the proxy
signs them — which is exactly why only anonymous SDK traffic failed.

### Fix

`resolveSiteId` now signs its internal service call with the same HMAC the
proxy adds (`hmacHeaders("", "", "", env)`).

---

## Root cause 2 — Half-finished flags-SSE ticket migration

The flags stream was migrated server-side to signed tickets (mirroring
notifications): SDK mints via `POST /stream/ticket`, connects with
`EventSource("/api/flags/stream?stream_ticket=…")`. The browser SDK and tests
were updated, but the edge was not:

- `isFlagsStreamWithTicket` existed in `proxy.ts` but was not wired into the
  org-required check (fixed concurrently on disk during this session).
- `POST /api/flags/stream/ticket` was missing from `PUBLIC_POST_PATTERNS`,
  so anonymous visitors got 401 when minting a ticket and SSE never connected.

### Fix

Added `/^\/api\/flags\/stream\/ticket$/` to `PUBLIC_POST_PATTERNS`
(`packages/workers/src/routes/public-routes.ts`). Org comes from the SDK's
`x-org-id`, re-signed at the edge.

---

## Root cause 3 — Storefront reading an admin-only endpoint (`GET /api/flags 401`)

`loadLayoutFlagKeys` (`packages/client/src/platform/browser-observability.ts`)
runs on **every storefront page load for every visitor**, calling admin CRUD
`GET /api/flags` — guarded upstream by `denyUnless(PERMISSIONS.FLAGS_WRITE)`.

- Anonymous visitor → guaranteed edge 401 on every load.
- Visitor with expired token → 401 → `redirectToLoginAfterUnauthorized()` →
  `clearSession()` + bounce to `/login?redirect=…` (the interleaved error in
  the logs).

Per the product rule in the flags docs, flags are for **any user, no sign-in**
— but the full CRUD list must stay admin-only (it returns targeting rules,
default values, descriptions).

### Design check against OSS flag platforms

| Platform | Anonymous client access | What clients never see |
|----------|------------------------|------------------------|
| **Flagsmith** | Public environment key; evaluated values only | "Segment/targeting rules are not exposed to the client to prevent leaking sensitive information" |
| **Unleash** | Dedicated Frontend API (`/api/frontend`) with environment-scoped frontend tokens; evaluated toggles only | Strategies/targeting rules (Admin API only) |

Our equivalent: values flow through `POST /api/flags/evaluate` (public) + SSE +
edge-seeded flags; the edge's Host→org HMAC signing plays the role of the
environment-scoped public token (edge = trusted boundary).

### Fix

New public endpoint `GET /api/flags/public`
(`packages/server/src/domains/flags/routes/crud.ts`, registered before `/:id`):

- Returns **active** flags' safe metadata only:
  `{ key, type, status, schemaId, variantId }`.
- No targeting rules, defaults, or descriptions — those remain behind
  `FLAGS_WRITE`.
- Made public at the edge (`/^\/api\/flags\/public$/` in
  `PUBLIC_GET_PATTERNS`); client switched to it in `browser-observability.ts`.
- Admin list `GET /api/flags` unchanged (JWT-gated).

---

## Not a code bug — the 500 bursts

`Network connection lost` / `{ remote: true, retryable: true }` from workerd
means the edge could not reach `API_ORIGIN` (`http://127.0.0.1:3000`) at all —
the API server was down/restarting during those windows. Distinct from the
400s above; no code change needed. If it recurs, check whether
`packages/server` is running before debugging the worker.

---

## Files changed

| File | Change |
|------|--------|
| `packages/workers/src/resolve-slug.ts` | Sign internal slug→org fetch with HMAC |
| `packages/workers/src/routes/public-routes.ts` | Public: `POST /api/flags/stream/ticket`, `GET /api/flags/public` |
| `packages/workers/src/routes/public-routes.test.ts` | Cover new public patterns + admin list stays authed |
| `packages/workers/src/resolve-slug.test.ts` | Mock env gets `WORKER_SERVER_SECRET`; assert HMAC headers sent |
| `packages/server/src/domains/flags/routes/crud.ts` | Add public-safe `GET /public` metadata route |
| `packages/client/src/platform/browser-observability.ts` | Read layout-bound keys from `/api/flags/public` |

(`proxy.ts` flagsTicketBypass wiring landed concurrently on disk.)

---

## Verification

- `vitest`: workers routes/slug suites 14/14, server flags domain 8/8.
- `tsc --noEmit`: workers ✅, server ✅ (client has pre-existing WIP errors in
  commerce component schemas, unrelated).
- Live smoke through running wrangler (`Host: yogastore.localhost`):
  - `200 GET /api/tenants/yogastore/catalog`
  - `200 GET /api/edge/schema/yogastore`
  - `200 GET /api/flags/public` (anonymous)
  - Ticket mint anonymous OK; ticketed `GET /api/flags/stream?stream_ticket=…`
    opens and holds as SSE.

---

## Follow-ups

- Consider a startup assertion that logs clearly when `WORKER_SERVER_SECRET`
  mismatches between edge and server (this class of failure surfaces only as
  mysterious 400s downstream).
- Watch for the API server process dying locally (the 500 bursts) — process
  supervision was removed with pm2 (`pnpm dev` scripts only).
