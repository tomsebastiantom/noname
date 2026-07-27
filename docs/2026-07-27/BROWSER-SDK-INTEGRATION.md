# Browser SDK — Integration Handoff

> **Status:** Phases A–C shipped; **flags → live UI hybrid shipped** (2026-07-27). Client wires `$flags` state + debounced layout re-fetch. Replay sampling off in dev (`sampleRate: 0`).  
> **Full spec:** [`docs/2026-07-11/BROWSER_SDK.md`](../2026-07-11/BROWSER_SDK.md)  
> **Package:** `packages/browser-sdk` → `@noname/browser-sdk`

---

## What this is (and is not)

| This | Not this |
|------|----------|
| Frontend **observability** — analytics, errors, trace, performance, flags, replay | E2E / Playwright click tests |
| **Browser SDK session** — correlate events in a tab (`sessionStorage`) | **Auth session** — JWT / ZITADEL login |
| Datadog RUM–style unified client | `@noname/browser-sdk` in Cursor IDE browser MCP |

One `init({ getHeaders, … })` wires all six modules with a shared session ID and W3C trace context. Org is **not** sent in JSON bodies — edge resolves it from Host into `x-org-id`.

---

## Analytics storage: ClickHouse, not OpenSearch

**We use ClickHouse for analytics time-series.** There is no OpenSearch / Elasticsearch in this repo.

| Layer | Technology | Location |
|-------|------------|----------|
| Event ingest (frontend + server) | BullMQ queue → worker batch insert | `packages/server/src/domains/analytics/` |
| Long-term storage | **ClickHouse** `analytics_events` (MergeTree, 90-day TTL) | `adapters/clickhouse.ts` |
| Operational DB | Postgres | flags, documents, auth config — **not** analytics events |
| Infra | Docker Compose `:8123` | `docker-compose.yml` → `CLICKHOUSE_URL` |

Server-side domain events (44 subscriptions) also flow into the same analytics pipeline as `eventSource: "server"`. Frontend events use `eventSource: "frontend"`.

**Agent tooling:** `analyze_analytics` in the agent domain queries this ClickHouse data — not a separate search stack.

---

## Current state

### Client package (`@noname/browser-sdk`) — ✅ built

| Module | Status | Notes |
|--------|--------|-------|
| Analytics | ✅ | Batched `track` / `pageView` → `POST /api/analytics/track` |
| Errors | ✅ | Dedup, breadcrumbs, `sendBeacon` on unload |
| Trace | ✅ | Hand-rolled W3C `traceparent`, optional `fetch` patch |
| Performance | ✅ | web-vitals + navigation/resource timing |
| Flags | ✅ | `POST /api/flags/evaluate` + SSE `GET /api/flags/stream` |
| Replay | ✅ | rrweb dynamic import, 5% sample, mask inputs |

Build: Vite library mode (~5.26 KB gzipped core). See `docs/2026-07-11/STATUS.md`.

### Server — ✅ browser ingest

| Endpoint | SDK expects | Server today |
|----------|-------------|--------------|
| `POST /api/analytics/track` | Batch JSON array | ✅ org from edge `x-org-id` |
| `POST /api/analytics/error` | `{ report }` or `{ reports[] }` | ✅ |
| `POST /api/analytics/replay` | `{ sessionId, events[] }` | ✅ → R2 + ClickHouse |
| `POST /api/flags/evaluate` | `{ context: { contextHash, … } }` | ✅ org from edge header |
| `GET /api/flags/stream` | SSE (no query orgId) | ✅ |

Flags CRUD and analytics query/aggregate APIs exist for admin/agent use; not part of the browser SDK surface.

### Client app (`packages/client`) — ✅ wired

- `@noname/browser-sdk` workspace dependency
- `platform/browser-observability.ts` — `init()` on bootstrap; `syncBrowserObservabilityContext()` after each edge schema load
- After `GET /api/edge/schema/:slug` succeeds, `main.tsx` seeds edge `flags`, calls `analytics.setContext`, `flags.evaluate()`, and `pageView()`
- `catalog-ui-shell.tsx` mirrors live flag values to json-render state at `/flags/{key}` — specs use `"visible": { "$state": "/flags/your_flag" }`
- Layout-bound flags (`schemaId` / `variantId` on definition) trigger debounced edge re-fetch via SSE → SDK → `loadPage()`
- Bootstrap in `main.tsx` (skipped on `/auth/callback`)
- Dev: `privacy.respectDNT: false`, `replay.sampleRate: 1` (all sessions); prod: `0.05`
- Replay blobs: `replays/{orgId}/{sessionId}/{chunkId}.json` in docker **s3rver** / prod **R2** (same `R2_*` env as assets)

---

## Two “sessions” — do not conflate

```
┌─────────────────────────────┐     ┌─────────────────────────────┐
│ Browser SDK session         │     │ Auth session                │
│ sessionStorage noname_session│     │ JWT in sessionStorage/cookie│
│ 30 min inactivity, per tab  │     │ ZITADEL access token        │
│ Correlates analytics/replay │     │ API Authorization + admin   │
└─────────────────────────────┘     └─────────────────────────────┘
```

After login, optionally call `sdk.errors.setUser({ id, email })` to attach identity to error reports. Analytics `sessionId` stays the tab-scoped observability ID unless explicitly overridden.

---

## Access control — storage vs who can read

### Data is org-scoped in storage

| What | Isolation |
|------|-----------|
| ClickHouse rows | `org_id` on every event |
| Replay blobs | `replays/{orgId}/{sessionId}/…` in R2/S3 |
| Ingest | Tagged with org from edge `x-org-id` only |

yogastore data and another org’s data do not share the same partition/path.

### Who can access today (gaps — dev)

| Action | Auth today | Risk in dev |
|--------|------------|-------------|
| **Ingest** (`POST /track`, `/error`, `/replay`) | Org from edge Host only (`x-org-id`); edge strips body `orgId` | Edge + `requireHeaderOrgId` |
| **Query** (`GET /events?orgId=…`) | **`analytics:view` + trusted org** | ✅ P0 |
| **Replay blob** | No download API yet; dev s3rver URL may be guessable | Direct bucket URL if key is known |

Same class of gap as documents API on `:3000` in dev — see [`SECURITY-HANDOFF.md`](../2026-07-25/SECURITY-HANDOFF.md). **Production boundary is edge + JWT; server hardening is follow-up.**

There is **no `analytics:view` permission** yet. Closest existing key is **`auth:manage`** (admin-only) on auth settings — analytics routes do not call `requirePermission` today.

---

## Who should access replays (target — when replay UI ships)

**Not implemented yet.** Build the UI only on top of these API rules:

```
Org admin (JWT + admin role + x-org-id matches token org)
    → list sessions for THEIR org only
    → fetch replay chunks where storageKey starts with replays/{theirOrgId}/
    → cannot pass another org’s orgId or storageKey (server rejects)
```

| Role | Replay / analytics read |
|------|-------------------------|
| **Admin** | Yes — list + play sessions for their org |
| **Editor** | No by default (session replay = PII / DOM content) |
| **Customer / public** | Never |
| **Unauthenticated** | Never |

**Server checks (required before UI):**

1. `requireAuthenticatedUser` + `requirePermission` (new `analytics:view` or reuse admin-only gate).
2. `orgId` from JWT/HMAC/`x-org-id` — **ignore client-supplied org id** on read paths when it disagrees.
3. `storageKey` must match `replays/{orgId}/…` for that org — no path traversal, no cross-org keys.
4. **Never** return a public R2 URL to the browser — stream blob bytes through authenticated API only.

---

## Security lives on the API — not in the layout spec

**Yes — you do not enforce auth in json-render layout JSON.** That is correct and intentional.

| Layer | Role |
|-------|------|
| **Layout spec** (`admin_replay`, `SessionReplayAdmin`, nav link) | **Presentation only** — who sees the screen in the normal app |
| **Catalog actions** (`listReplaySessions`, `fetchReplayChunk`) | Call `fetch('/api/analytics/…')` with `apiHeaders()` — same as team/pages |
| **Server routes** | **Real enforcement** — JWT, permissions, org match, storageKey prefix |

Hiding the replay admin link from editors in the seed spec is **UX**, not security. An editor could still `curl` the API — only server `403` stops them.

Same pattern as team members, auth settings, documents: **spec-driven UI does not replace server guards.**

When replay UI is added:

1. Lock down **read** routes on the server first.
2. Add admin layout + component that calls those routes (MountAction / actions).
3. Optional: omit nav item from editor-exposed layouts — cosmetic only.

---

## How it connects to the platform

```
Visitor → edge schema (schemaId, variantId, contextHash)
              ↓
browser-sdk analytics.setContext(schemaId, variantId, contextHash)
              ↓
Every track / error / replay chunk carries attribution
              ↓
ClickHouse ← BullMQ ← POST /api/analytics/*
              ↓
Agent: analyze_analytics, segment discovery
              ↓
Flags: same contextHash → POST /api/flags/evaluate → json-render variants (future)
```

**Client wiring (shipped):** `main.tsx` passes `segment` from the edge schema response into `syncBrowserObservabilityContext()`, which calls `setContext`, `flags.evaluate()`, and `pageView()` in that order.

This is **identity-agnostic** — commerce examples in older docs are one vertical, not the platform identity.

---

## Implementation plan (next coding slice)

### Phase A — Server gaps (ClickHouse path only)

1. **`POST /api/analytics/track`** — accept **batch array** (SDK sends JSON array); org from **`x-org-id` header only** (edge strips body `orgId`).
2. **`POST /api/analytics/error`** — ingest as `eventType: "frontend.error"` with full report in `meta` (or dedicated column via meta JSON). Support single object or array (unload beacon).
3. **`POST /api/analytics/replay`** — MVP: accept chunk, store **summary** in ClickHouse (`eventType: "session_replay.chunk"`, `meta: { eventCount, sessionId }`). Full rrweb blob storage (S3) is Phase 3 per original spec — do not block on it.
4. **`POST /api/flags/evaluate`** — org from **`x-org-id` header only** (`requireHeaderOrgId`); edge strips `context.orgId` from old clients.

No OpenSearch. No new databases.

### Phase B — Browser SDK transport

5. **`getHeaders()`** on `BrowserSDKOptions` — `x-org-id` + auth on fetch calls. SDK does **not** send `orgId` in JSON bodies.
6. **`sendBeacon`** (unload) has no headers — edge resolves org from Host; payloads are events/reports/chunks only.

### Phase C — Client wire-up

7. Add `"@noname/browser-sdk": "workspace:*"` to `packages/client/package.json`; build SDK before client dev (`pnpm --filter @noname/browser-sdk build`).
8. New `packages/client/src/platform/browser-observability.ts`:
   - `resolveOrgIdFromHostname()` → `x-org-id` via `getHeaders` only
   - `init({ getHeaders: () => ({ "x-org-id": orgId, …apiHeaders() }) })`
   - `syncBrowserObservabilityContext({ contextHash: segment })` from `loadPage()` after edge schema — sets attribution, re-evaluates flags, then `pageView()`
   - Disable or lower `replay.sampleRate` in dev if ClickHouse noise is a concern
9. Call `initBrowserObservability()` from app bootstrap (not inside json-render catalog — host concern, like `main.tsx` auth gate).

### Phase E — Replay admin UI (after auth)

13. Add `analytics:view` (or admin-only) + `requirePermission` on `GET /api/analytics/events`, new `GET /api/analytics/replay/sessions`, `GET /api/analytics/replay/chunks/:storageKey`.
14. `admin_replay` layout spec + `SessionReplayAdmin` catalog component — calls secured APIs only; no R2 URLs in spec.
15. Replay player (rrweb `Replayer`) in component — chunks from authenticated API, not public bucket.

See **Who should access replays** above — implement server gates before step 14.

### Phase D — Edge / production (later)

10. Edge worker injects `x-org-id` + JWT; SDK may omit explicit headers when proxied.
11. History API auto-capture (Phase 3 in original doc) if not covered by `subscribeAppLocation`.
12. Source maps, replay compression, S3 replay storage.

---

## Dev prerequisites

```bash
docker compose up postgres clickhouse zitadel   # analytics needs ClickHouse
pnpm init:zitadel && pnpm seed:demo             # org + yogastore slug
pnpm --filter @noname/browser-sdk build
pnpm dev                                        # API :3000, client :5173
```

Env: `CLICKHOUSE_URL`, `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD`, `CLICKHOUSE_DB` (see `.env.example`).

Verify ingest:

```bash
# After client wired — or manual curl with x-org-id:
curl -X POST http://localhost:3000/api/analytics/track \
  -H "Content-Type: application/json" \
  -H "x-org-id: YOUR_ORG_ID" \
  -d '[{"eventType":"page_view","sessionId":"test","meta":{"url":"/"}}]'
```

Query events: `GET /api/analytics/events?orgId=…` (server API).

---

## Privacy and E2E

SDK defaults (see `packages/browser-sdk/src/core/privacy.ts`):

- Refuses init on bot / `navigator.webdriver` — **except** Playwright/Cypress
- Respects DNT/GPC unless `privacy.respectDNT: false` in init
- Replay masks all inputs by default

For local dev demo, DNT may need to be relaxed or users with DNT enabled will not initialize the SDK.

---

## Files to touch (when implementing)

| Area | Files |
|------|-------|
| SDK headers | `packages/browser-sdk/src/types.ts`, `index.ts`, `modules/analytics.ts`, `modules/errors.ts`, `modules/replay.ts`, `core/transport.ts` |
| Server | `packages/server/src/domains/analytics/api.ts`, `service.ts` (if batch helper), `ports.ts` |
| Flags fallback | `packages/server/src/domains/flags/api.ts` |
| Client | `packages/client/package.json`, `src/platform/browser-observability.ts`, `src/main.tsx` |

---

## Related docs

- [`BROWSER_SDK.md`](../2026-07-11/BROWSER_SDK.md) — full module spec, event shapes, phases
- [`analytics-domain.md`](../2026-07-04/analytics-domain.md) — ClickHouse schema, query patterns
- [`flags-domain.md`](../2026-07-04/flags-domain.md) — evaluation + SSE
- [`ANALYTICS-REPLAY-PENDING.md`](./ANALYTICS-REPLAY-PENDING.md) — P0–P3 backlog + verification checklist

---

*Update this file when replay UI or analytics read auth ships.*
