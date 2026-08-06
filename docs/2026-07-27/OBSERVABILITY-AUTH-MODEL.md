# Observability auth model — logged-in vs anonymous

> **Status:** User identity stitching shipped (2026-07-27)  
> **Related:** [`BROWSER-SDK-INTEGRATION.md`](./BROWSER-SDK-INTEGRATION.md), [`ANALYTICS-REPLAY-PENDING.md`](./ANALYTICS-REPLAY-PENDING.md)

---

## Short answer

**Analytics ingest does not require login.** Anonymous and logged-in visitors use the same public SDK paths and org resolution (Host → `x-org-id`).

**After login**, the client calls `sdk.setUser({ id, email })`. Subsequent events carry `meta.userId` (and errors carry `user`). Server prefers edge `x-user-id` on fetch; beacons use SDK meta.

| Concern | Anonymous visitor | Logged-in user |
|---------|--------------------|----------------|
| Ingest routes | ✅ public at edge | ✅ same |
| Org | Host → `x-org-id` | JWT org or Host → `x-org-id` |
| `meta.userId` on events | absent | ✅ after `setUser` |
| `user_identified` event | — | ✅ once per tab after login |
| Pre-login events in same tab | no userId | **not backfilled** (by design) |
| Cross-session user history | query by `meta.userId` | ✅ same user id across visits |
| Read APIs | **401** | admin + `analytics:view` |

---

## Two sessions

```
┌──────────────────────────────┐     ┌──────────────────────────────┐
│ Browser SDK session          │     │ Auth session                 │
│ sessionStorage noname_session│     │ JWT (ZITADEL access token)   │
│ Tab-scoped correlation id    │     │ Login / logout lifecycle     │
└──────────────────────────────┘     └──────────────────────────────┘
```

- **SDK session** — `sessionId` on every event; replay correlation.
- **Auth session** — JWT `sub` → `sdk.setUser({ id: sub })` after login.

Logging in does **not** rotate the SDK session. Pre-login events in the same tab stay anonymous in storage.

---

## User identity stitching (shipped)

### Client

1. `initBrowserObservability()` → `syncObservabilityUserFromSession()` if JWT present.
2. Every `loadPage()` → re-sync (token may hydrate from cookie after SDK init).
3. Logout → `clearObservabilityUser()` before `clearSession()`.

JWT `sub` read from stored access token (`sessionUserId()` in `auth/session.ts`).

### SDK (`@noname/browser-sdk`)

```ts
sdk.setUser({ id: "zitadel-sub", email?: "..." })
  → errors.setUser(user)
  → analytics.track("user_identified")  // once
  → all later track() calls include meta.userId (+ userEmail/userName)

sdk.clearUser()  // logout
```

### Server

`enrichEventMeta(headerUserId, meta)` on ingest:

1. **Fetch + JWT:** edge `x-user-id` wins (authoritative).
2. **Beacon unload:** keeps `meta.userId` from SDK (no headers on beacon).
3. **Errors:** also extracts `report.user.id` when no header.

Stored in ClickHouse `meta` JSON as `userId`. Query example:

```sql
SELECT * FROM analytics_events
WHERE org_id = {org:String}
  AND JSONExtractString(meta, 'userId') = {userId:String}
```

---

## What is still not automatic (P4 — see pending doc)

Tracked in [`ANALYTICS-REPLAY-PENDING.md`](./ANALYTICS-REPLAY-PENDING.md) § **P4 — User identity**:

| # | Item | Plan |
|---|------|------|
| **4a** | Pre-login events in same tab | **Shipped** — query-time session join on replay list API |
| **4b** | Admin replay filter by user | **Shipped** — search + user column in `SessionReplayAdmin` |

Also open (lower priority):

| Gap | Notes |
|-----|-------|
| Dedicated `user_id` column | In `meta` today; add column later for faster queries |
| Real segment from signals | Client still requests `segment=default`; personalize path exists server-side |
| Cross-org JWT vs Host | Edge prefers JWT org — document/enforce mismatch policy |

---

## Ingest vs read (unchanged)

| Write (ingest) | Read (admin) |
|----------------|--------------|
| No JWT required | JWT + `analytics:view` |
| Org from edge header | Trusted org from HMAC |
| User optional in meta | Same permission gate |

---

## Key files

| Area | Files |
|------|-------|
| SDK user API | `packages/browser-sdk/src/index.ts`, `modules/analytics.ts` |
| Client sync | `packages/client/src/platform/browser-observability.ts`, `auth/session.ts` |
| Server enrich | `packages/server/src/domains/analytics/browser-ingest.ts`, `api.ts` |
| Logout clear | `AuthBar.tsx`, `AdminNav.tsx`, `core/actions/auth.ts` |

---

*Ingest stays open for all visitors. Login adds account labels for analysis — not an auth gate on telemetry.*
