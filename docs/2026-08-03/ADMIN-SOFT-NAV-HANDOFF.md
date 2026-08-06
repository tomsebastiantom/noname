# Admin soft navigation — handoff

> **Status:** Flicker fix shipped (Aug 2026). **P1 session hardening shipped 2026-08-05** (U1/U2). P2–P4 below still open.  
> **Related:** [LAYOUT-COMPOSITION.md](../2026-07-31/LAYOUT-COMPOSITION.md), [FLAGS-UI-LIVE-UPDATE-DECISION.md](../2026-07-27/FLAGS-UI-LIVE-UPDATE-DECISION.md)

## Problem

Clicking admin sidebar items caused visible **flicker**: main content blanked out, layout jumped, sidebar felt unstable.

Admin is **not** separate React routes. Each click updates the URL → `loadPage()` in `main.tsx` fetches a layout spec from edge → client swaps the **panel** inside a stable **AdminShell**.

The bug was treating every sidebar click like a **full page reload** instead of **in-shell navigation**.

## What we shipped (done)

| Task | File(s) | Why |
|------|---------|-----|
| **Keep previous panel visible while loading** | `main.tsx` | Stopped clearing `panelSpec` when `navigating=true` (was showing blank / “Loading…”) |
| **Soft admin nav** | `main.tsx` | When already in admin (`adminRoute && contentRef.current`), skip `navigating` UI, session re-check, and catalog manifest refetch |
| **Panel spec cache** | `main.tsx` | `adminPanelCacheRef` — instant panel on revisit; network still refreshes in background |
| **Stable admin shell** | `main.tsx`, `admin-platform-view.tsx` | `key="admin"` on `AdminPlatformView`; split `adminBaseShellProps` (nav chrome) vs `adminPanelSpec` (inner content) |
| **Deferred panel swap** | `admin-platform-view.tsx` | `useDeferredValue` keeps old panel + header title until next panel is ready to paint |
| **Progress bar overlay** | `main.tsx` | Absolute-position bar (no layout shift); hidden during admin soft nav |
| **Account security dual-route** (earlier in same effort) | `demo.ts`, `platform-routes.ts`, `AccountSecurityForm.tsx` | `/admin/settings/security` in admin shell; `/account/security` stays storefront |

### Key files

```
packages/client/src/main.tsx                      — loadPage, softAdminNav, caches
packages/client/src/platform/admin-platform-view.tsx — stable shell + deferred panel
packages/client/src/admin/components/shell/AdminShell.tsx
packages/client/src/admin/components/shell/AdminNav.tsx
```

### How to verify

1. `pnpm dev` + seed store (e.g. `yogastore.localhost:5173`)
2. Sign in as admin, open `/admin`
3. Click sidebar items (Users, Flags, Analytics, etc.)
4. Expect: sidebar stable, no blank flash, no vertical jump; thin in-panel pulse only while fetch pending (first visit to a page)

---

## Architecture (long-term model)

```
First admin entry     → session/MFA check + catalog manifest load + shell mount
Later sidebar clicks  → fetch panel spec only (SWR: cache + deferred UI)
Invalidate caches     → on focus, logout, catalog hash change, explicit refresh (partially missing — see below)
```

**Soft admin nav is the intended long-term pattern**, not a hack. It matches SPA admin shells: persistent chrome, swap inner content.

---

## Audit: what is already safe

| Concern | Covered by |
|---------|------------|
| **Who can mutate data** | Server `denyUnless` / `requirePermission` on API routes |
| **First admin entry** | `main.tsx` MFA + `fetchAuthSessionStatus` when `!softAdminNav` |
| **Login gate** | Redirect if `!isLoggedIn()` before admin loads |
| **Per-page permission UI** | Actions like `loadLayoutAdmin` fetch session at load time; forms use `useCatalogSubmit` → `apiFetch` |
| **Layout updates on flag change** | `subscribeFlagLayoutRefresh` → `loadPage()` still fetches **edge schema** on soft nav |

---

## Gaps — pick up later

These do **not** require reverting soft nav. They complete the model it assumes.

### P1 — Session revalidation (security UX)

**Problem:** Session is checked on first admin entry only. `useAdminSession` refetches when `loggedIn` changes, not on focus or interval. Expired session or revoked role → stale sidebar until full reload; mutations 401/403 without auto-logout.

**Shipped 2026-08-05:**

- [x] Add `visibilitychange` hook to refetch `fetchAuthSessionStatus` while in admin — `packages/client/src/auth/admin-access.ts`
- [x] On 401 from `apiFetch`, central handler: `clearSession()` + redirect to `/login?redirect=…` — `packages/client/src/lib/api.ts`, `session.ts`
- [x] On schema fetch 401 during soft nav, same redirect — `main.tsx`

**Still open:**

- [ ] Optional: re-run MFA gate if `requireMfaForAdmin && !mfaEnrolled` after session refetch

**Files:** `main.tsx`, `lib/api.ts`, maybe `auth/admin-access.ts`

---

### P2 — Catalog manifest invalidation (freshness)

**Problem:** Soft nav skipped `GET /api/tenants/:slug/catalog`. Mid-session deploy of new marketplace/private remotes was not picked up until hard reload or leaving admin.

**Shipped 2026-08-05:**

- [x] Store last manifest hash in a ref (from first load) — `catalogHashRef` in `main.tsx`
- [x] On soft nav (and flag layout refresh): GET catalog; if fingerprint changed → `loadCatalogs(manifest)` + `setRegistry`
- [x] Fingerprint helper — `manifestFingerprint()` in `catalog-loader.ts`

**Operator note:** After publishing a new tenant catalog remote, staff in admin pick up changes on the **next sidebar click** or flag-driven layout refresh — no hard reload required. If the catalog GET fails (network), the previous registry is kept.

**Files:** `main.tsx`, `catalog-loader.ts`

---

### P3 — Edge schema auth (pre-existing, not introduced by soft nav)

**Problem:** `GET /api/edge/schema/:siteId` has no auth middleware. Client hides admin UI; specs are technically fetchable without a token.

**Suggested tasks (product/security decision):**

- [ ] Require auth for `renderAs: panel` / admin templates on edge
- [ ] Or accept public layout specs + rely on API auth for data (document the threat model)

**Files:** `packages/server/src/domains/edge/api.ts`, `edge/service.ts`

---

### P4 — Nice-to-have UX

- [x] Prefetch panel spec on sidebar link `mouseenter` / focus — `admin-panel-prefetch.ts` + `AdminNav` (U4, 2026-08-05)
- [ ] Crossfade between panels instead of hard `CatalogUiShell` remount (needs ActionProvider lifecycle workaround — see `catalog-ui-shell.tsx` comments on `key`)
- [ ] Sonar: reduce `loadPage` cognitive complexity in `main.tsx` (split helpers)

---

## Decision log

| Question | Answer |
|----------|--------|
| Is soft admin nav long-term? | **Yes** — in-shell SPA navigation |
| Is skipping session on every click OK? | **Yes**, with P1 shipped (visibility + 401 redirect) |
| Is skipping catalog on every click OK? | **Yes for layout-only nav** — manifest is re-fetched; remotes reload only when fingerprint changes (P2 shipped) |
| Still fetch panel spec every click? | **Yes** — `/api/edge/schema` always runs |

---

## Quick grep for resume

```bash
rg "softAdminNav|adminPanelCache|adminBaseShellProps|useDeferredValue" packages/client/src
```

---

## Changelog reference

- Admin menu flicker: fixed via soft nav + deferred panel + caches (Aug 2026)
- Account security: admin route at `/admin/settings/security` (same period)
