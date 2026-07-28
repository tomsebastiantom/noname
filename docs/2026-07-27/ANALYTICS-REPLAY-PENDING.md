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
| Replay compression | Not started |
| Playwright E2E | Deferred |
| Re-seed after layout changes | `pnpm seed:demo` |
| ClickHouse `user_id` column | In `meta` today; optional perf follow-up |

### P4 — User identity (follow-ups)

| # | Item | Approach | Notes |
|---|------|----------|-------|
| **4a** | **Pre-login events in same tab** | Query-time join (preferred) | Do **not** backfill ClickHouse rows. At read time: sessions where `session_id` has any `meta.userId = X` **or** a later `user_identified` in that session → treat whole session as that user. Replay for that tab already shows pre-login DOM. |
| **4b** | **Admin replay filter by user** | API + UI | Extend session list: distinct `session_id` filtered by `JSONExtractString(meta,'userId')` + rule from 4a. `SessionReplayAdmin`: search by user id / email. Optional badge: "identified mid-session". |

**4a detail (when implementing):**

- Read API: `GET /api/analytics/replay/sessions?userId=` (or segment-events helper)
- Logic: `session_id IN (SELECT DISTINCT session_id FROM events WHERE userId match OR event_type = 'user_identified' AND userId match)`
- No SDK / ingest change required

**4b detail (when implementing):**

- Depends on 4a session resolution (or duplicate query in list endpoint)
- Admin only; still gated by `analytics:view`
- Key files: `read-guards.ts`, `api.ts` replay sessions route, `SessionReplayAdmin.tsx`

See also [`OBSERVABILITY-AUTH-MODEL.md`](./OBSERVABILITY-AUTH-MODEL.md) § *What is still not automatic*.

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

*Backlog: P4 user-identity follow-ups (4a + 4b) queued for later.*
