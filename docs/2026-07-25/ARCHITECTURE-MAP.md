# Architecture Map — Start Here

> **Date:** 2026-07-25  
> **Status:** Active — master index for platform docs  
> **Current snapshot:** [`PLATFORM-STATUS.md`](./PLATFORM-STATUS.md) — where we are before the next build  
> **Tenant MF handoff:** [`TENANT-MF-HANDOFF.md`](./TENANT-MF-HANDOFF.md) — per-file changes, bugs, fixes (2026-07-25)  
> **Read this first**, then open the linked doc for the area you are working on.

---

## Build order (what to implement next)

```
✅ A    Login (email) + JWT
✅ B    Commerce extension + cart machine
✅ 1    Content render pipeline     → CMS content → $state → resolved spec on edge
✅ A2   Per-org auth config         → tenant_settings.auth in Postgres
✅ C    Admin UI                    → shell, CMS, auth, pages, polish (DataTable, delete warnings)
✅ 3    Store slug                  → yogastore.localhost → org on edge (KV + resolve API)
📋 D    Permissions + visual editor → permissions first, then editor UI
         → code: PERMISSIONS-IMPLEMENTATION-PLAN.md (Slices 1→4)
         → model: PERMISSIONS-MASTER-PLAN.md
```

| Step | Doc | Validates when |
|------|-----|----------------|
| **1 Content pipeline** | [`CONTENT-RENDER-PIPELINE.md`](./CONTENT-RENDER-PIPELINE.md) | Product text from CMS entry, not baked into layout JSON |
| **2 Per-org auth** | [`ORG-AUTH-CONFIG.md`](./ORG-AUTH-CONFIG.md) | Org A has Google, Org B does not — no `.env` IdP id |
| **3 Admin** | [`ADMIN-UI-LATER.md`](./ADMIN-UI-LATER.md) + [`SPEC-DRIVEN-UI.md`](./SPEC-DRIVEN-UI.md) | Merchant UI from layout specs — no ad-hoc React pages |
| **4 Page routing** | [`PAGE-ROUTING.md`](./PAGE-ROUTING.md) | ✅ `/about` via page_tree — client uses `?url=` for storefront |

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
page_tree (URL)  ──┐
page document    ──┼──► resolve url → layoutRef + contentRef
content entry    ──┼──► layout.resolve + content.resolve
layout template  ──┘         │
                             ▼
                      $state + resolveElementProps
                             │
                             ▼
                      resolved layout JSON ──► Renderer + catalog
```

Today: client sends `?url=/path` for storefront; platform paths use `?template=` — see [`PAGE-ROUTING.md`](./PAGE-ROUTING.md).

Login flow skips content resolve — see [`LOGIN-UI.md`](./LOGIN-UI.md).

---

## Doc index by topic

### Platform overview

| Doc | What it covers |
|-----|----------------|
| **[`ROADMAP-PHASES.md`](./ROADMAP-PHASES.md)** | Phases A → D, validate criteria |
| **[`PLATFORM-STATUS.md`](./PLATFORM-STATUS.md)** | **Current snapshot** — shipped vs next (read before new work) |
| **[`PER-ORG-MODEL.md`](./PER-ORG-MODEL.md)** | **Multi-tenant overview** — who owns what, two-store example |
| **[`CONTENT-RENDER-PIPELINE.md`](./CONTENT-RENDER-PIPELINE.md)** | CMS → layout → `$state` → resolved spec |
| **[`PAGE-ROUTING.md`](./PAGE-ROUTING.md)** | URL → page_tree → edge schema ✅ |
| [`documents-domain.md`](../2026-07-10/documents-domain.md) | Full CMS data model (content types, locales, assets, pages) |
| [`DOCUMENT-REFS.md`](./DOCUMENT-REFS.md) | Unified `{ documentId }` pointer model + delete warnings |
| [`RESOLVE-REFS.md`](./RESOLVE-REFS.md) | Batch resolve API — labels + asset previews |
| [`ACCOUNT-FLOWS.md`](./ACCOUNT-FLOWS.md) | Forgot password, sign-up, MFA login + TOTP enrollment |

### Client

| Doc | What it covers |
|-----|----------------|
| [`CLIENT-CATALOG-LAYERS.md`](./CLIENT-CATALOG-LAYERS.md) | Core vs extension vs MF remote |
| [`TENANT-MF-CDN.md`](./TENANT-MF-CDN.md) | **Tenant MF remotes** — build, R2, CDN delivery (design) |
| [`TENANT-MF-REIMPL.md`](./TENANT-MF-REIMPL.md) | **Rebuild guide** — step order + checklist (start here when coding) |
| [`TENANT-MF-GIT.md`](./TENANT-MF-GIT.md) | **Tenant catalog source** — Git repo → validate → build → publish (planned) |
| [`TENANT-MF-SECURITY.md`](./TENANT-MF-SECURITY.md) | **Tenant catalog security** — trust model, allowlist, gaps (later) |
| [`TENANT-MF-HANDOFF.md`](./TENANT-MF-HANDOFF.md) | **Session handoff** — file changelog, issues, fixes (review before commit) |
| [`SPEC-DRIVEN-UI.md`](./SPEC-DRIVEN-UI.md) | **How to add UI** — catalog skeleton, layout docs, where text lives |
| [`skills/spec-driven-ui/SKILL.md`](../../skills/spec-driven-ui/SKILL.md) | Same workflow for any AI editor (Cursor, Kilo, etc.) |
| [`CLIENT-ACTIONS.md`](./CLIENT-ACTIONS.md) | Spec → `executeAction` → handlers (login, addToCart) |
| [`EXTENSION-LIFECYCLE.md`](./EXTENSION-LIFECYCLE.md) | Extension = manifest + schemas + components + machines + layout |
| [`EXTENSIONS.md`](./EXTENSIONS.md) | Naming: “extension” not plugin/domain |

### Auth & login

| Doc | What it covers |
|-----|----------------|
| [`AUTH-IDENTITY.md`](./AUTH-IDENTITY.md) | ZITADEL, `org_id`, JWT, edge HMAC |
| [`EMBEDDED-LOGIN.md`](./EMBEDDED-LOGIN.md) | Why password login goes through server broker |
| [`LOGIN-UI.md`](./LOGIN-UI.md) | LoginForm, social scaffold, UI phases |
| [`ACCOUNT-FLOWS.md`](./ACCOUNT-FLOWS.md) | Forgot password, sign-up, MFA verify + enrollment |
| [`ORG-AUTH-CONFIG.md`](./ORG-AUTH-CONFIG.md) | Per-org providers — **no env shortcuts** |
| [`SECURITY-HANDOFF.md`](./SECURITY-HANDOFF.md) | Auth hardening: issues, fixes, test checklist |
| [`TEAM-ROLES-ZITADEL.md`](./TEAM-ROLES-ZITADEL.md) | **Team RBAC** — ZITADEL only; Postgres for field ACLs + store config |
| [`PERMISSIONS-REBAC.md`](./PERMISSIONS-REBAC.md) | **Zanzibar-style** doc ACL, editor capabilities, op log, consistency model |
| [`VISUAL-EDITOR-IMPLEMENTATION-ORDER.md`](./VISUAL-EDITOR-IMPLEMENTATION-ORDER.md) | **Build order 0→10** — OpenFGA design, ZITADEL, editor, Automerge, Hocuspocus |
| [`SPEC-STORAGE-MERGE.md`](./SPEC-STORAGE-MERGE.md) | **Layout spec** — catalog Zod validation, partial storage, merge on read |
| [`PHASE-3-STORE-SLUG.md`](./PHASE-3-STORE-SLUG.md) | `yogastore.localhost` slug routing (slug-only URLs) |

### Admin

| Doc | What it covers |
|-----|----------------|
| [`ADMIN-UI-LATER.md`](./ADMIN-UI-LATER.md) | `/admin` shell, DataTable lists, CMS, auth settings |
| [`PERMISSIONS-MASTER-PLAN.md`](../2026-07-27/PERMISSIONS-MASTER-PLAN.md) | **Permissions master plan** — start here; Phase 0→3, gaps, validation |
| [`PERMISSIONS-IMPLEMENTATION-PLAN.md`](../2026-07-27/PERMISSIONS-IMPLEMENTATION-PLAN.md) | **Coding checklist** — Slices 1→4, files, validate |
| [`PERMISSIONS-IDP-COMPARISON.md`](../2026-07-27/PERMISSIONS-IDP-COMPARISON.md) | ZITADEL vs Auth0/Keycloak/Logto; token refresh |
| [`VISUAL-EDITOR-PLAN.md`](./VISUAL-EDITOR-PLAN.md) | **Visual editor next steps** — permissions model, gaps, build order before `?edit=true` |
| [`VISUAL-EDITOR-UX.md`](./VISUAL-EDITOR-UX.md) | **Merchant UX** — Google Docs–style click-to-edit, spec binding, save bar |
| [`VISUAL_EDITOR.md`](../2026-07-11/VISUAL_EDITOR.md) | Inline edit implementation, PropsPanel, save/publish flow |

---

## Where data lives (quick reference)

| Data | Storage | Org operators edit via |
|------|---------|-------------------|
| CMS entry fields (any content type) | `content` document | Admin → Content (`ContentEntryAdmin`, DataTable + delete warnings) |
| Page structure (Hero, ProductCard) | `layout` document | Admin → Layouts or visual editor ([`VISUAL-EDITOR-PLAN.md`](./VISUAL-EDITOR-PLAN.md)) |
| Login welcome text, admin panel titles | `layout` template **props** | Admin → Login appearance / layout editor |
| OAuth / save / publish button labels | `layout` props + `tenant_settings.auth.providerLabels` | Admin / layout seed — **not** React TSX |
| Google on/off, sign-up, reset flags | `tenant_settings.auth` + ZITADEL IdP | Admin → Auth settings |
| TOTP enrollment (user) | ZITADEL user MFA | `/account/security` (`AccountSecurityForm`) |
| Extension components | `@noname/extensions` | Platform ships; manifest enables |
| Tenant custom components | R2 + CDN (planned) | Rebuild per [`TENANT-MF-REIMPL.md`](./TENANT-MF-REIMPL.md); Git later [`TENANT-MF-GIT.md`](./TENANT-MF-GIT.md) |
| Side effects (login, cart) | `core/actions` + `auth/*` | Code — one path only |

**Copy rule (platform vs org):** Each **org** customizes **text** via layout JSON props and `tenant_settings` — never by editing React. Platform ships **components + catalog schema**; orgs own **documents**. See [`SPEC-DRIVEN-UI.md`](./SPEC-DRIVEN-UI.md) · `skills/spec-driven-ui/`.

---

## Deprecated / merged docs

| Old file | Use instead |
|----------|-------------|
| `LOGIN-UI-PLAN.md` | [`LOGIN-UI.md`](./LOGIN-UI.md) |
| `LOGIN-UI-MODERN-PLAN.md` | [`LOGIN-UI.md`](./LOGIN-UI.md) |
