# Product Roadmap — Phased Build & Validate

> **Date:** 2026-07-25  
> **Status:** Active  
> **Start here:** [`ARCHITECTURE-MAP.md`](./ARCHITECTURE-MAP.md)

---

## Principle

**Validate after each phase** — do not build admin or multi-tenant auth shortcuts before the pipeline is correct.

```
✅ A     Login (email) + JWT
✅ B     Commerce extension + cart machine
✅ 1     Content render pipeline   → CMS → $state → resolved spec on edge
✅ A2    Per-org auth config       → tenant_settings.auth in Postgres
📋 C     Admin UI                  → edit without seeds  (in progress)
📋 D     Scale                     → slug, domains, editor
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
| `GET /api/tenants/:orgId/auth/config` from Postgres | ✅ |
| `PUT /api/tenants/:orgId/auth/config` (admin/seed) | ✅ |
| `startIdpLogin` uses per-org `idpIds` | ✅ |
| Removed env `listEnabledProviders` / `resolveIdpId` | ✅ |
| ZITADEL IdP registration API (Management API) | 📋 Phase C |
| Admin UI toggles | 📋 Phase C |

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

## Phase C — Admin UI 📋 (started)

Merchant manages content, layouts, auth settings without seeds.

| Task | Status |
|------|--------|
| `AdminShell` + `/admin` routing | ✅ |
| Auth gate → `/login?redirect=` | ✅ |
| `AuthSettingsForm` → `PUT auth/config` | ✅ |
| Seed `admin_dashboard` layout | ✅ |
| Content / layout editors | 📋 |
| ZITADEL IdP registration API | 📋 |

**Validate:** Sign in → `http://{orgId}.localhost:5173/admin/settings/auth` → toggle providers → Save → `GET auth/config` reflects changes.

**Doc:** [`ADMIN-UI-LATER.md`](./ADMIN-UI-LATER.md)

---

## Phase D — Scale 📋

| Item | Doc |
|------|-----|
| Store slug | [`PHASE-3-STORE-SLUG.md`](./PHASE-3-STORE-SLUG.md) |
| Custom domains | [`AUTH-IDENTITY.md`](./AUTH-IDENTITY.md) |
| Tenant MF remotes | [`MODULE_FEDERATION.md`](../2026-07-11/MODULE_FEDERATION.md) |

---

## Order summary

| # | Phase | Build | Validate |
|---|-------|-------|----------|
| **A** | Login | Email + JWT | ✅ |
| **B** | Commerce | Extension + cart | ✅ |
| **1** | Content pipeline | Edge `$state` resolve | ✅ |
| **A2** | Auth config | Per-org Postgres + ZITADEL | ✅ |
| **C** | Admin | Shell + settings UI | No seeds |
| **D** | Polish | Slug, editor | Multi-use-case |

---

## References

- [`ARCHITECTURE-MAP.md`](./ARCHITECTURE-MAP.md) — master doc index
- [`documents-domain.md`](../2026-07-10/documents-domain.md) — full CMS model
