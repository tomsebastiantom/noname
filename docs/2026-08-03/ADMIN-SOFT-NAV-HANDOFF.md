# Admin soft navigation — handoff

> **Status:** Flicker fix shipped (Aug 2026). Hardening items below are **not** done yet — pick up when ready.  
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

**Suggested tasks:**

- [ ] Add `visibilitychange` (or 5–10 min TTL) hook to refetch `fetchAuthSessionStatus` while in admin
- [ ] On 401 from `apiFetch`, central handler: `clearSession()` + redirect to `/login?redirect=…`
- [ ] On schema fetch 401 during soft nav, same redirect (today: error banner only)
- [ ] Optional: re-run MFA gate if `requireMfaForAdmin && !mfaEnrolled` after session refetch

**Files:** `main.tsx`, `lib/api.ts`, maybe `auth/admin-access.ts`

---

### P2 — Catalog manifest invalidation (freshness)

**Problem:** Soft nav skips `GET /api/tenants/:slug/catalog`. Mid-session deploy of new marketplace/private remotes is not picked up until hard reload or leaving admin. Flag-driven `loadPage()` also skips manifest when already in admin.

**Suggested tasks:**

- [ ] Store last manifest hash in a ref (from first load)
- [ ] On soft nav (or flag layout refresh): lightweight HEAD or GET catalog; if hash changed → `loadCatalogs(manifest)` + `setRegistry`
- [ ] Or: `loadPage({ forceCatalog: true })` from `subscribeFlagLayoutRefresh` only
- [ ] Document when operators must hard-refresh after tenant catalog publish

**Files:** `main.tsx`, `catalog-loader.ts` (`resetCatalogCache` already exists for tests)

---

### P3 — Edge schema auth (pre-existing, not introduced by soft nav)

**Problem:** `GET /api/edge/schema/:siteId` has no auth middleware. Client hides admin UI; specs are technically fetchable without a token.

**Suggested tasks (product/security decision):**

- [ ] Require auth for `renderAs: panel` / admin templates on edge
- [ ] Or accept public layout specs + rely on API auth for data (document the threat model)

**Files:** `packages/server/src/domains/edge/api.ts`, `edge/service.ts`

---

### P4 — Nice-to-have UX

- [ ] Prefetch panel spec on sidebar link `mouseenter` (zero-wait nav)
- [ ] Crossfade between panels instead of hard `CatalogUiShell` remount (needs ActionProvider lifecycle workaround — see `catalog-ui-shell.tsx` comments on `key`)
- [ ] Sonar: reduce `loadPage` cognitive complexity in `main.tsx` (split helpers)

---

## Decision log

| Question | Answer |
|----------|--------|
| Is soft admin nav long-term? | **Yes** — in-shell SPA navigation |
| Is skipping session on every click OK? | **Yes**, if revalidated elsewhere (P1 not done yet) |
| Is skipping catalog on every click OK? | **Yes for layout-only nav**; not OK for mid-session catalog deploys without P2 |
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
- **Editor soft nav:** same pattern for `?edit=true` page switches (Aug 2026) — see below

---

## Editor soft navigation (shipped Aug 2026)

Visual editor (`?edit=true`) now uses the same in-session model as admin.

### Problem

Switching storefront pages while editing re-ran full `loadPage`: progress bar, manifest refetch, session check, remounted editor chrome, blank layout/content loading states.

### What we shipped

| Task | File(s) |
|------|---------|
| **`EditorPlatformView`** — stable host, deferred page props | `platform/editor-platform-view.tsx` |
| **Soft editor nav** — skip `navigating`, session, manifest when already in editor | `main.tsx` |
| **Editor shell cache** — `visual_editor` shell loaded once per session | `main.tsx` (`editorShellCacheRef`) |
| **Editor page cache** — instant revisit by `pathname:template` | `main.tsx` (`editorPageCacheRef`) |
| **Layout draft cache** — per-template draft from API | `editor/hooks/layout-draft-cache.ts`, `use-layout-draft.ts` |
| **Content draft cache** — per content ref | `editor/hooks/content-draft-cache.ts`, `use-content-draft.ts` |
| **Reset ephemeral state on page switch** | `use-edit-page-orchestration.ts` (selection, history, pending add) |

### Verify

1. Open storefront page with `?edit=true` (draft permission required)
2. Navigate to another page keeping `?edit=true` (e.g. home → product)
3. Expect: editor chrome stays mounted, no full-page loading flash, thin top pulse while edge fetch runs

### Editor follow-ups (same as admin P1–P2)

- Session revalidation on focus / TTL while in editor
- Manifest hash check on soft editor nav
- Warn before navigating away with unsaved dirty state
