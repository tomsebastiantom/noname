# Browser SDK — Integration Handoff

> **Status:** Phases A–C shipped (2026-07-27). Client wired; server batch/error/replay endpoints live. Replay sampling off in dev (`sampleRate: 0`). E2E Playwright deferred — vitest smoke tests in `browser-ingest.test.ts`.  
> **Full spec:** [`docs/2026-07-11/BROWSER_SDK.md`](../2026-07-11/BROWSER_SDK.md)  
> **Package:** `packages/browser-sdk` → `@noname/browser-sdk`

---

## What this is (and is not)

| This | Not this |
|------|----------|
| Frontend **observability** — analytics, errors, trace, performance, flags, replay | E2E / Playwright click tests |
| **Browser SDK session** — correlate events in a tab (`sessionStorage`) | **Auth session** — JWT / ZITADEL login |
| Datadog RUM–style unified client | `@noname/browser-sdk` in Cursor IDE browser MCP |

One `init({ orgId, … })` wires all six modules with a shared session ID and W3C trace context.

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
| `POST /api/analytics/track` | Batch array or `{ orgId, events }` | ✅ |
| `POST /api/analytics/error` | `{ orgId, report }` or `{ orgId, reports[] }` | ✅ → ClickHouse via `frontend.error` |
| `POST /api/analytics/replay` | `{ orgId, sessionId, events[] }` | ✅ → rrweb JSON in **R2/S3** (`replays/{orgId}/{sessionId}/…`) + summary in ClickHouse |
| `POST /api/flags/evaluate` | `{ context: { orgId, … } }` | ✅ `context.orgId` fallback |
| `GET /api/flags/stream?orgId=` | SSE | ✅ |

Flags CRUD and analytics query/aggregate APIs exist for admin/agent use; not part of the browser SDK surface.

### Client app (`packages/client`) — ✅ wired

- `@noname/browser-sdk` workspace dependency
- `platform/browser-observability.ts` — `init()` on bootstrap; `syncBrowserObservabilityContext()` after each edge schema load
- After `GET /api/edge/schema/:slug` succeeds, `main.tsx` calls `analytics.setContext(…, …, segment)` + `flags.evaluate()` + `pageView()` so events carry the same segment hash the edge used for layout/flags
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

1. **`POST /api/analytics/track`** — accept **batch array** (SDK sends JSON array); resolve `orgId` from `x-org-id` header or `body.orgId`.
2. **`POST /api/analytics/error`** — ingest as `eventType: "frontend.error"` with full report in `meta` (or dedicated column via meta JSON). Support single object or array (unload beacon).
3. **`POST /api/analytics/replay`** — MVP: accept chunk, store **summary** in ClickHouse (`eventType: "session_replay.chunk"`, `meta: { eventCount, sessionId }`). Full rrweb blob storage (S3) is Phase 3 per original spec — do not block on it.
4. **`POST /api/flags/evaluate`** — `orgId = getOrgId(c) || context.orgId`.

No OpenSearch. No new databases.

### Phase B — Browser SDK transport

5. Add optional **`getHeaders(): Record<string, string>`** to `BrowserSDKOptions` — merge into analytics/errors `fetch` (flags already send `orgId` in body; SSE uses query param).
6. Replay `sendBeacon` cannot set headers — include `orgId` in JSON body; server reads from body.

### Phase C — Client wire-up

7. Add `"@noname/browser-sdk": "workspace:*"` to `packages/client/package.json`; build SDK before client dev (`pnpm --filter @noname/browser-sdk build`).
8. New `packages/client/src/platform/browser-observability.ts`:
   - `resolveOrgIdFromHostname()` → `orgId`
   - `init({ orgId, getHeaders: () => ({ "x-org-id": orgId, …apiHeaders() }) })`
   - `syncBrowserObservabilityContext({ contextHash: segment })` from `loadPage()` after edge schema — sets attribution, re-evaluates flags, then `pageView()`
   - Disable or lower `replay.sampleRate` in dev if ClickHouse noise is a concern
9. Call `initBrowserObservability()` from app bootstrap (not inside json-render catalog — host concern, like `main.tsx` auth gate).

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
- [`MOBILE_APP.md`](../2026-07-11/MOBILE_APP.md) — `@noname/mobile-sdk` mirrors same module layout

---

*Update this file when client integration ships or server endpoints land.*
