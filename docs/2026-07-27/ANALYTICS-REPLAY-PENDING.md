# Analytics & replay — pending work

> **Status:** P0–P2 + **P3 replay player + flags public ingest + editor nav UX shipped** (2026-07-27).  
> **Related:** [`BROWSER-SDK-INTEGRATION.md`](./BROWSER-SDK-INTEGRATION.md), [`ANALYTICS-REPLAY-TEST-RUN.md`](./ANALYTICS-REPLAY-TEST-RUN.md)

---

## Verification snapshot (dev)

| Check | Result |
|-------|--------|
| Read routes without JWT | **401** ✅ |
| Ingest without `x-org-id` | **400** ✅ |
| Body `orgId` on ingest | **ignored** — header only ✅ |
| Edge `POST /analytics/track` no JWT | not 302 ✅ (201 if Redis up) |
| Edge `POST /flags/evaluate` no JWT | not 302 ✅ |
| Edge `GET /flags/stream` no JWT | not 302 ✅ |
| `REQUIRE_EDGE_HMAC=true` without HMAC | **401** ✅ |
| Replay admin + rrweb player | `/admin/settings/replay` ✅ |
| Editor nav: no replay link | Client filters on `analytics:view` ✅ |

---

## Completed

| Phase | Items |
|-------|--------|
| **P0** | `analytics:view`, secured read + replay download API |
| **P1** | `admin_replay`, `SessionReplayAdmin`, seed layout |
| **P2** | Edge strips body/query orgId; server `requireHeaderOrgId` only |
| **P3** | rrweb-player in admin, `playReplaySession` action |
| **UX** | Hide replay nav/home links for editors (no `analytics:view`) |
| **Flags** | Public edge routes for `POST /evaluate` + `GET /stream`; fixed `/stream` route order |
| **User stitch** | `sdk.setUser` on login; `meta.userId` on ingest; see [`OBSERVABILITY-AUTH-MODEL.md`](./OBSERVABILITY-AUTH-MODEL.md) |

---

## Still open

| Item | Notes |
|------|-------|
| Playwright E2E | Deferred |
| Re-seed after layout changes | `pnpm seed:demo` |
| ClickHouse `user_id` column | In `meta` today; optional perf follow-up |

### P4 — User identity (follow-ups)

| # | Item | Approach | Notes |
|---|------|----------|-------|
| **4a** | **Pre-login events in same tab** | Query-time join | **Shipped 2026-08-06** — `listReplaySessionIdsForUser` + `?userId=` / `?q=` on replay sessions API. No ClickHouse backfill. |
| **4b** | **Admin replay filter by user** | API + UI | **Shipped 2026-08-06** — `SessionReplayAdmin` search + user column + mid-session badge. |

**4a detail (implemented):**

- Read API: `GET /api/analytics/replay/sessions?userId=` · `?userEmail=` · `?q=` (id or email)
- Logic: distinct `session_id` where `JSONExtractString(meta,'userId')` or `userEmail` matches (includes pre-login chunk in same tab once user identified)
- No SDK / ingest change

**4b detail (implemented):**

- `SessionReplayAdmin` search form → `listReplaySessions({ q })`
- User column + optional “Identified mid-session” when `user_identified` fired in session
- Key files: `replay-sessions.ts`, `routes/replay.ts`, `SessionReplayAdmin.tsx`

See also [`OBSERVABILITY-AUTH-MODEL.md`](./OBSERVABILITY-AUTH-MODEL.md) § *What is still not automatic*.

### Replay compression (O3 — shipped 2026-08-06)

| Item | Notes |
|------|-------|
| Replay gzip compression | **Shipped** — `@noname/browser-sdk` gzip via `fflate` + Web Worker; server stores `.json.gz`; legacy JSON ingest still works |

---

## Production checklist

```bash
REQUIRE_EDGE_HMAC=true
WORKER_SERVER_SECRET=<shared with wrangler>
```

---

## Key files

| Area | Files |
|------|-------|
| Edge public routes | `packages/workers/src/routes/public-routes.ts` |
| Public org | Edge `strip-public-org.ts`; server `requireHeaderOrgId` in `org.ts` |
| Flags API | `packages/server/src/domains/flags/api.ts` |
| Replay player | `packages/client/src/core/components/ReplayPlayer.tsx` |
| Editor nav filter | `AdminNav.tsx`, `AdminHome.tsx` |

---

*Backlog: Playwright E2E (O4) and replay compression (O3) queued for later.*
