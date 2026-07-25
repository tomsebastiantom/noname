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
📋 1    Content render pipeline   → CMS → $state → resolved spec on edge  BUILD NEXT
📋 A2   Per-org auth config       → tenant_settings.auth, no env IdP
📋 C    Admin UI                  → edit without seeds
📋 D    Scale                     → slug, domains, editor
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

## Step 1 — Content render pipeline 📋 BUILD NEXT

**Goal:** Storefront text from CMS content entries, merged on edge — not baked into layout JSON.

| Task | Status |
|------|--------|
| Edge: `content.resolve` + `$state` + `resolveElementProps` | 📋 |
| Commerce seed: product content type + entry + `$state` layout | 📋 |
| Page routing via `contentRef` (optional follow-up) | 📋 |

**Validate:**

1. Edit product title in CMS entry → storefront shows new title without layout republish
2. Layout spec keeps `{ "$state": "title" }` slots
3. Login page unchanged (layout props only)

**Doc:** [`CONTENT-RENDER-PIPELINE.md`](./CONTENT-RENDER-PIPELINE.md)

---

## Phase A2 — Per-org auth config 📋

**Goal:** Social providers per org in Postgres + ZITADEL — **no `ZITADEL_GOOGLE_IDP_ID` env shortcut**.

| Task | Status |
|------|--------|
| `tenant_settings.auth` | 📋 |
| `GET auth/config` from Postgres per `:orgId` | 📋 |
| ZITADEL IdP registration API per org | 📋 |

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

## Phase C — Admin UI 📋

Merchant manages content, layouts, auth settings without seeds.

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
| **1** | Content pipeline | Edge `$state` resolve | CMS text on storefront |
| **A2** | Auth config | Per-org Postgres + ZITADEL | Social per org |
| **C** | Admin | Shell + settings UI | No seeds |
| **D** | Polish | Slug, editor | Multi-use-case |

---

## References

- [`ARCHITECTURE-MAP.md`](./ARCHITECTURE-MAP.md) — master doc index
- [`documents-domain.md`](../2026-07-10/documents-domain.md) — full CMS model
