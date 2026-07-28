# Analytics & replay — manual test run

> **Date:** 2026-07-27  
> **Env:** `yogastore.localhost:5173` (client), `:8787` (edge), `:3000` (server)  
> **Tester:** agent (API curl + browser UI)  
> **Related:** [`ANALYTICS-REPLAY-PENDING.md`](./ANALYTICS-REPLAY-PENDING.md), [`OBSERVABILITY-AUTH-MODEL.md`](./OBSERVABILITY-AUTH-MODEL.md)

---

## How to re-run

```bash
# Infra (if not already up)
docker compose up postgres clickhouse redis zitadel s3 -d
pnpm seed:demo

# Dev processes
pnpm dev                    # server :3000
pnpm --filter @noname/workers dev   # edge :8787
pnpm --filter @noname/client dev    # client :5173
pnpm --filter @noname/browser-sdk build

# Automated
pnpm fix
pnpm vitest run packages/server/src/domains/analytics packages/workers/src/routes
```

**Demo URLs**

| URL | Purpose |
|-----|---------|
| http://yogastore.localhost:5173/ | Storefront + SDK |
| http://yogastore.localhost:5173/login | Login |
| http://yogastore.localhost:5173/admin/settings/replay | Session replay admin |
| http://yogastore.localhost:5173/admin/settings/flags | Feature flags admin |

**Demo admin:** `admin@zitadel.localhost` / `NonameAdmin1!`

---

## 1. Automated checks

| Step | Command / area | Expected | Result |
|------|----------------|----------|--------|
| 1.1 | `pnpm fix` | 0 lint errors | ✅ 288 files clean |
| 1.2 | Vitest analytics + edge routes | all pass | ✅ **30/30** pass |
| 1.3 | Client typecheck | no errors | ✅ pass |

---

## 2. API — security & org (no login)

| Step | Request | Expected | Result |
|------|---------|----------|--------|
| 2.1 | `POST /api/analytics/track` direct to `:3000`, no headers | 400 org required | ✅ `{"error":"org id required"}` |
| 2.2 | `GET /api/analytics/events` direct to `:3000`, no JWT | 401 | ✅ `Authentication required` |
| 2.3 | `GET /api/analytics/replay/sessions` via edge, no JWT | redirect / deny | ✅ **302** (edge login redirect) |
| 2.4 | `POST /api/flags/evaluate` via edge, no JWT, Host yogastore | 200 | ✅ `{ evaluations: [] }` |
| 2.5 | `GET /api/flags/stream` via edge, no JWT | SSE connected | ✅ `data: {"type":"connected"}` |
| 2.6 | `GET /api/edge/schema/yogastore?segment=default&url=/` | layout + flags | ✅ returns spec + `show_summer_sale` |
| 2.7 | `GET /api/tenants/resolve/yogastore` | org id | ✅ `383371762538184712` |

---

## 3. API — ingest (blocked by infra)

| Step | Request | Expected | Result |
|------|---------|----------|--------|
| 3.1 | `POST /api/analytics/track` via edge, batch array, Host yogastore | 201 accepted | ✅ **201** (after Dragonfly fix) |
| 3.2 | Same direct to `:3000` + `x-org-id` | 201 | ✅ **201** |
| 3.3 | Same + `x-user-id` (user stitch) | 201 + meta.userId | ✅ **201** (worker persists to ClickHouse) |

**Root cause (server log):**

```
ReplyError: ERR script tried accessing undeclared key, key: bull:analytics-events:NN
```

BullMQ queue add fails against Redis. Redis port **6379 is up**, but queue keys appear corrupted or Redis ACL/script policy is rejecting BullMQ Lua scripts.

**Root cause (fixed 2026-07-28):** Dev uses **Dragonfly** (not Redis) via Podman. BullMQ Lua scripts need Dragonfly flags `--cluster_mode=emulated --lock_on_hashtags` **and** hashtag queue names (`{analytics-events}`). See [Dragonfly BullMQ docs](https://www.dragonflydb.io/docs/integrations/bullmq).

```bash
# Recreate Dragonfly after compose change:
podman compose up -d dragonfly --force-recreate
# Optional: clear stale pre-fix queue keys
podman exec noname-dragonfly-1 redis-cli FLUSHDB
# Restart API server so it picks up new queue names
```

**Workaround to retry ingest tests (pre-fix):**

```bash
# Clear BullMQ keys (dev only)
redis-cli KEYS 'bull:analytics-events:*' | xargs redis-cli DEL
# Restart server after flush
```

Until ingest works: no events in ClickHouse → replay list stays empty → SDK `pageView` calls in browser log 500 in dev-server proxy.

**Not a security regression** — auth/org gates behave correctly; failure is queue write.

---

## 4. API — authenticated admin (browser JWT)

Used admin session from logged-in browser (`Authorization: Bearer …` via edge).

| Step | Request | Expected | Result |
|------|---------|----------|--------|
| 4.1 | `GET /api/analytics/events?limit=3` | 200 (admin + analytics:view) | ✅ 200 `{"data":[]}` |
| 4.2 | `GET /api/analytics/replay/sessions` | 200 session list | ✅ 200 `{"sessions":[]}` |
| 4.3 | `GET /api/flags` | 200 flag CRUD list | ✅ 200, `show_summer_sale` present |
| 4.4 | `POST /api/flags/evaluate` + `show_summer_sale` | evaluation | ✅ 200, value `false` |
| 4.5 | `POST /api/analytics/track` with JWT | 201 | ❌ **500** (same BullMQ issue) |

---

## 5. UI — browser (manual)

Browser: logged-in admin session already present.

| Step | Action | Expected | Result |
|------|--------|----------|--------|
| 5.1 | Open `/` | Storefront renders | ✅ "Welcome to Noname", Sign out visible |
| 5.2 | Open `/admin/settings/replay` | Replay admin layout | ✅ Sidebar + "Session replay" heading |
| 5.3 | Replay empty state | Message when no sessions | ✅ "No replay sessions yet…" |
| 5.4 | Open `/admin/settings/flags` | Flags admin | ✅ `show_summer_sale` listed, Off, Turn on button |
| 5.5 | Admin nav links | Overview, Pages, Feature flags, Session replay | ✅ All visible for admin |
| 5.6 | Hard refresh `/admin/settings/flags` | Page loads | ⚠️ Sometimes stuck on **"Loading…"** (SPA + schema fetch; retry works) |
| 5.7 | SPA click Feature flags from replay | Client nav | ⚠️ URL changed but content lagged once (full reload OK) |
| 5.8 | Play replay / rrweb player | Play button on session row | ⏭️ Skipped — no sessions (ingest 500) |
| 5.9 | Login flow via curl | token | ❌ Failed without real OIDC client id (UI login works) |

---

## 6. Features verified by unit tests (not re-run live)

| Feature | Test file | Status |
|---------|-----------|--------|
| Body `orgId` ignored; header wins | `browser-ingest.test.ts` | ✅ |
| `x-user-id` merged into event meta | `browser-ingest.test.ts` | ✅ |
| Edge strips body/query orgId | `strip-public-org.test.ts` | ✅ |
| Public route patterns (track, flags) | `public-routes.test.ts` | ✅ |
| Read routes require analytics:view | `read-auth.test.ts` | ✅ |

---

## 7. User identity stitching

| Step | Check | Result |
|------|-------|--------|
| 7.1 | Client `syncObservabilityUserFromSession()` on load | ✅ Code wired; browser has JWT in sessionStorage |
| 7.2 | `sdk.setUser` → `user_identified` event | ⏭️ Blocked — ingest 500 |
| 7.3 | `meta.userId` in ClickHouse after login | ⏭️ Blocked — ingest 500 |
| 7.4 | Logout clears SDK user | ✅ Code wired (`clearObservabilityUser`) |

---

## Summary

| Area | Verdict |
|------|---------|
| **Security** (org header, read auth, public ingest routes) | ✅ Working |
| **Flags** (evaluate, stream, admin CRUD UI) | ✅ Working |
| **Admin UI** (replay, flags shells) | ✅ Working |
| **Analytics ingest** (track/error/replay write) | ✅ Fixed — Dragonfly + hashtag queues |
| **Replay playback** | ⏭️ Re-test after browsing storefront with replay on |
| **User stitch end-to-end** | ⏭️ Re-test with logged-in browser session |
| **Lint / unit tests** | ✅ Clean |

---

## Issues to fix (priority)

1. ~~**P0 infra:** BullMQ `analytics-events` queue~~ ✅ Dragonfly flags + `{analytics-events}` queue names
2. **P2 UX:** Admin SPA sometimes shows long "Loading…" on hard navigation to settings routes.
3. **P4 backlog:** Pre-login session join + replay filter by user (documented, not tested — needs ingest first).

---

*Next test pass: after Redis queue fix, re-run steps 3.x, 4.5, 5.8, 7.2–7.3 and confirm events appear in replay admin.*
