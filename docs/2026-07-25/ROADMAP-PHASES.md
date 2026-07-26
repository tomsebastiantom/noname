# Product Roadmap — Phased Build & Validate

> **Date:** 2026-07-25  
> **Status:** Active  
> **Start here:** [`ARCHITECTURE-MAP.md`](./ARCHITECTURE-MAP.md) · **Snapshot:** [`PLATFORM-STATUS.md`](./PLATFORM-STATUS.md)

---

## Principle

**Validate after each phase** — do not build admin or multi-tenant auth shortcuts before the pipeline is correct.

```
✅ A     Login (email) + JWT
✅ B     Commerce extension + cart machine
✅ 1     Content render pipeline   → CMS → $state → resolved spec on edge
✅ A2    Per-org auth config       → tenant_settings.auth in Postgres
✅ C     Admin UI                  → edit without seeds
✅ 3     Store slug                → Host + path + KV → org id
📋 D     Scale                     → visual editor, custom domains
```

---

## Phase A — Login UI ✅

**Goal:** Sign-in on our page. ZITADEL = IdP only.

| Task | Status |
|------|--------|
| `LoginForm`, `/login` layout, JWT flow | ✅ |
| `executeAction` for login / idpLogin | ✅ |
| shadcn polish | ✅ |

**Doc:** [`LOGIN-UI.md`](./LOGIN-UI.md) · [`EMBEDDED-LOGIN.md`](./EMBEDDED-LOGIN.md)

---

## Step 1 — Content render pipeline ✅

**Goal:** Storefront text from CMS content entries, merged on edge — not baked into layout JSON.

| Task | Status |
|------|--------|
| Edge: `content.resolve` + `$state` + `resolveElementProps` | ✅ |
| Layout `data.contentRef` + query override | ✅ |
| Commerce seed: product content type + entry + `$state` layout | ✅ |

**Validate:** `pnpm seed:demo:commerce` — edge returns `title: "Blue Sneakers"` on ProductCard.

**Doc:** [`CONTENT-RENDER-PIPELINE.md`](./CONTENT-RENDER-PIPELINE.md)

---

## Phase A2 — Per-org auth config ✅

**Goal:** Social providers per org in Postgres — runtime reads `tenant_settings.auth`, not `.env`.

| Task | Status |
|------|--------|
| `tenant_settings.auth` schema | ✅ |
| `GET /api/tenants/:slug/auth/config` from Postgres | ✅ |
| `PUT /api/tenants/:slug/auth/config` (admin/seed) | ✅ |
| `startIdpLogin` uses per-org `idpIds` | ✅ |
| Removed env `listEnabledProviders` / `resolveIdpId` | ✅ |
| ZITADEL Google IdP on Save (Management API) | ✅ Phase C |
| Admin UI toggles (Google) | ✅ Phase C |

**Validate:** `PUT auth/config` with `idpIds.google` → `GET auth/config` returns `providers: ["google"]` (no secrets in response).

**Doc:** [`ORG-AUTH-CONFIG.md`](./ORG-AUTH-CONFIG.md)

---

## Phase B — Commerce validation ✅

| Task | Status |
|------|--------|
| `addToCart` → machines API | ✅ |
| Cart machine + commerce seed | ✅ |

**Note:** Product copy in seed is still layout literals — fixed in Step 1.

**Doc:** [`EXTENSION-LIFECYCLE.md`](./EXTENSION-LIFECYCLE.md)

---

## Phase C — Admin UI ✅ (core complete)

Merchant manages content, layouts, pages, auth settings without re-seeding.

| Task | Status |
|------|--------|
| `AdminShell` + `/admin` routing | ✅ |
| Auth gate → `/login?redirect=` | ✅ |
| `AuthSettingsForm` → Google + GitHub + Apple → ZITADEL + Postgres | ✅ |
| `LoginBrandingForm` → edit login layout props (title, logo, brand) | ✅ |
| `ContentEntryAdmin` → generic CMS (any content type) | ✅ |
| `LayoutEntryAdmin` → publish layout specs from UI | ✅ |
| `PageEntryAdmin` + `PageTreeAdmin` → storefront routing | ✅ |
| Seed `admin_pages` + page_tree commerce URL | ✅ |
| Seed `admin_dashboard` + `admin_content` + `admin_login` layouts | ✅ |
| Core demo: `page` content type (no commerce required) | ✅ |
| Custom IdPs via `auth_provider` CMS | ✅ |
| Admin polish — `DataTable`, settings nav, delete-ref warnings | ✅ |
| Account flows — forgot password, sign-up, MFA login + enrollment | ✅ [`ACCOUNT-FLOWS.md`](./ACCOUNT-FLOWS.md) |
| Visual editor `?edit=true` | 📋 Phase D |

**Validate:**

- Content: sign in → `/admin/content` → edit entry → Save & publish
- Auth: `/admin/settings/auth` → enable providers → Save
- Login branding: `/admin/settings/login` → edit title/logo → Save & publish → `/login`

**Doc:** [`ADMIN-UI-LATER.md`](./ADMIN-UI-LATER.md)

---

## Phase 3 — Store slug ✅

**Goal:** Friendly dev URLs (`yogastore.localhost`) — slug in paths and Host, edge KV cache.

| Task | Status |
|------|--------|
| `tenant_settings.data.slug` + unique on save | ✅ |
| `GET /api/tenants/resolve/:slug` | ✅ |
| Edge: Host + path slug → org id (KV) | ✅ |
| Client: slug subdomain + slug in fetch paths | ✅ |
| Legacy numeric org id in URLs | ❌ removed (slug-only) |

**Validate:** `GET /api/tenants/resolve/yogastore` → `{ orgId }`; open `http://yogastore.localhost:5173`.

**Doc:** [`PHASE-3-STORE-SLUG.md`](./PHASE-3-STORE-SLUG.md)

---

## Phase D — Scale 📋

| Item | Doc |
|------|-----|
| Visual editor `?edit=true` | [`VISUAL_EDITOR.md`](../2026-07-11/VISUAL_EDITOR.md) |
| Custom domains | [`AUTH-IDENTITY.md`](./AUTH-IDENTITY.md) |
| Tenant MF remotes | [`MODULE_FEDERATION.md`](../2026-07-11/MODULE_FEDERATION.md) |
| Org MFA policy (`requireMfaForAdmin`) | [`ORG-AUTH-CONFIG.md`](./ORG-AUTH-CONFIG.md) |
| Published-only refs on save/publish | [`DOCUMENT-REFS.md`](./DOCUMENT-REFS.md) § Future |

Page routing (URL → spec) is ✅ — see [`PAGE-ROUTING.md`](./PAGE-ROUTING.md).

---

## Order summary

| # | Phase | Build | Validate |
|---|-------|-------|----------|
| **A** | Login | Email + JWT | ✅ |
| **B** | Commerce | Extension + cart | ✅ |
| **1** | Content pipeline | Edge `$state` resolve | ✅ |
| **A2** | Auth config | Per-org Postgres + ZITADEL | ✅ |
| **C** | Admin | Shell + auth + content + pages CMS + polish | ✅ |
| **3** | Store slug | `yogastore.localhost` → org on edge | ✅ |
| **D** | Scale | Visual editor, custom domains | 📋 |

---

## References

- [`ARCHITECTURE-MAP.md`](./ARCHITECTURE-MAP.md) — master doc index
- [`SPEC-DRIVEN-UI.md`](./SPEC-DRIVEN-UI.md) — how to add UI without drifting from spec pipeline
- [`documents-domain.md`](../2026-07-10/documents-domain.md) — full CMS model
