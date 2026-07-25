# Architecture Map — Start Here

> **Date:** 2026-07-25  
> **Status:** Active — master index for platform docs  
> **Read this first**, then open the linked doc for the area you are working on.

---

## Build order (what to implement next)

```
✅ A    Login (email) + JWT
✅ B    Commerce extension + cart machine
📋 1    Content render pipeline     → CMS content → $state → resolved spec on edge
📋 2    Per-org auth config (A2)    → tenant_settings.auth, no env IdP shortcuts
📋 3    Admin UI (C)                → edit content/layouts/auth without seeds
📋 4    Scale (D)                   → slug, domains, editor, 2nd extension
```

| Step | Doc | Validates when |
|------|-----|----------------|
| **1 Content pipeline** | [`CONTENT-RENDER-PIPELINE.md`](./CONTENT-RENDER-PIPELINE.md) | Product text from CMS entry, not baked into layout JSON |
| **2 Per-org auth** | [`ORG-AUTH-CONFIG.md`](./ORG-AUTH-CONFIG.md) | Org A has Google, Org B does not — no `.env` IdP id |
| **3 Admin** | [`ADMIN-UI-LATER.md`](./ADMIN-UI-LATER.md) | Merchant publishes layout/content without `pnpm seed:demo` |

Full phase checklist: [`ROADMAP-PHASES.md`](./ROADMAP-PHASES.md)

---

## Two page types (do not mix)

| Page | Text source | Edge behavior |
|------|-------------|---------------|
| **Login** `/login` | Layout spec **props** (`title`, `logoUrl`, `providers`) | Return spec as-is |
| **Storefront** `/`, product URLs | **Content entries** + layout `$state` slots | Merge content → `resolveElementProps` → resolved spec |

Login copy is **not** a CMS content entry. Product/page copy **is**.

---

## Runtime flow (storefront)

```
Postgres                    Edge                         Client
────────                    ────                         ──────
content entry    ──┐
layout template  ──┼──► layout.resolve + content.resolve
page (optional)  ──┘         │
                             ▼
                      $state + resolveElementProps
                             │
                             ▼
                      resolved layout JSON ──► Renderer + catalog
```

Login flow skips content resolve — see [`LOGIN-UI.md`](./LOGIN-UI.md).

---

## Doc index by topic

### Platform overview

| Doc | What it covers |
|-----|----------------|
| **[`ROADMAP-PHASES.md`](./ROADMAP-PHASES.md)** | Phases A → D, validate criteria |
| **[`CONTENT-RENDER-PIPELINE.md`](./CONTENT-RENDER-PIPELINE.md)** | CMS → layout → `$state` → resolved spec (**build next**) |
| [`documents-domain.md`](../2026-07-10/documents-domain.md) | Full CMS data model (content types, locales, assets, pages) |

### Client

| Doc | What it covers |
|-----|----------------|
| [`CLIENT-CATALOG-LAYERS.md`](./CLIENT-CATALOG-LAYERS.md) | Core vs extension vs MF remote |
| [`CLIENT-ACTIONS.md`](./CLIENT-ACTIONS.md) | Spec → `executeAction` → handlers (login, addToCart) |
| [`EXTENSION-LIFECYCLE.md`](./EXTENSION-LIFECYCLE.md) | Extension = manifest + schemas + components + machines + layout |
| [`EXTENSIONS.md`](./EXTENSIONS.md) | Naming: “extension” not plugin/domain |

### Auth & login

| Doc | What it covers |
|-----|----------------|
| [`AUTH-IDENTITY.md`](./AUTH-IDENTITY.md) | ZITADEL, `org_id`, JWT, edge HMAC |
| [`EMBEDDED-LOGIN.md`](./EMBEDDED-LOGIN.md) | Why password login goes through server broker |
| [`LOGIN-UI.md`](./LOGIN-UI.md) | LoginForm, social scaffold, UI phases |
| [`ORG-AUTH-CONFIG.md`](./ORG-AUTH-CONFIG.md) | Per-org providers — **no env shortcuts** |

### Later

| Doc | What it covers |
|-----|----------------|
| [`ADMIN-UI-LATER.md`](./ADMIN-UI-LATER.md) | `/admin` shell, auth settings UI |
| [`PHASE-3-STORE-SLUG.md`](./PHASE-3-STORE-SLUG.md) | `yogastore.localhost` hostname routing |

---

## Where data lives (quick reference)

| Data | Storage | Merchant edits via |
|------|---------|-------------------|
| Product title, price, description | `content` document | Admin CMS (later) |
| Page structure (Hero, ProductCard) | `layout` document | Admin layout editor |
| Login welcome text | `layout` login template props | Admin auth appearance |
| Google on/off per store | `tenant_settings.auth` + ZITADEL IdP | Admin auth settings |
| `"Continue with Google"` label | Platform component | Not merchant CMS |
| Extension components | `@noname/extensions` | Platform ships; manifest enables |
| Side effects (login, cart) | `core/actions` + `auth/*` | Code — one path only |

---

## Deprecated / merged docs

| Old file | Use instead |
|----------|-------------|
| `LOGIN-UI-PLAN.md` | [`LOGIN-UI.md`](./LOGIN-UI.md) |
| `LOGIN-UI-MODERN-PLAN.md` | [`LOGIN-UI.md`](./LOGIN-UI.md) |
