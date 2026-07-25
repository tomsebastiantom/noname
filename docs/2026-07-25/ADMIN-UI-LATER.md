# Admin UI — Load & manage

> **Date:** 2026-07-25  
> **Status:** Phase C in progress — shell, auth settings, generic content CMS shipped  
> **Start with:** [`ARCHITECTURE-MAP.md`](./ARCHITECTURE-MAP.md) · [`SPEC-DRIVEN-UI.md`](./SPEC-DRIVEN-UI.md) · Login: [`LOGIN-UI.md`](./LOGIN-UI.md)  
> **Related:** [`VISUAL_EDITOR.md`](../2026-07-11/VISUAL_EDITOR.md), [`MODULE_FEDERATION.md`](../2026-07-11/MODULE_FEDERATION.md), [`documents-domain.md`](../2026-07-10/documents-domain.md)

---

## Two admin surfaces (both core platform)

| Surface | URL | Purpose |
|---------|-----|---------|
| **Store admin** | `/admin/*` | Dashboard — forms, lists, settings (this doc) |
| **Visual editor** | `/?edit=true` on live pages | Click components on storefront ([`VISUAL_EDITOR.md`](../2026-07-11/VISUAL_EDITOR.md)) — not built yet |

Store admin is **extension-agnostic**. Commerce is optional demo data; admin edits **documents** (content types, layouts, auth).

**Architecture:** Admin pages are **layout specs** + core catalog components — same json-render pipeline as storefront. See [`SPEC-DRIVEN-UI.md`](./SPEC-DRIVEN-UI.md). Do not add standalone React admin routes.

---

## Goal

Merchant dashboard inside `packages/client` (no separate package):

- **Admin shell** — sidebar, header (shadcn) ✅
- **Content** — schema-driven CMS entry editor (any `:type`) ✅
- **Auth settings** — social login + ZITADEL IdP registration (Google) ✅
- **Layout templates** — `admin_dashboard`, `admin_content` in documents domain ✅
- **Layout editor** — publish home/login specs from UI 📋
- **Visual editor** — `?edit=true` on live storefront 📋
- **Page-specific JS** — Module Federation remotes 📋

---

## Components (core catalog)

| Component | Purpose | Status |
|-----------|---------|--------|
| `AdminShell` | Sidebar + main slot | ✅ |
| `AuthSettingsForm` | Per-org auth toggles + Google OAuth → ZITADEL | ✅ |
| `ContentEntryAdmin` | List/edit/publish CMS entries by content type | ✅ |
| `AdminNav` / `AdminPageHeader` | Optional polish | 📋 |
| `DataTable` | CRUD lists | 📋 |
| `PropsPanel` | Visual editor side panel | 📋 |

`LoginForm` lives on `/login` — not part of admin shell.

---

## Routes & templates

Same json-render pipeline as storefront — path maps to a **layout template name**, edge returns the spec tree:

| Path | Edge template | Main component |
|------|---------------|----------------|
| `/admin/settings/auth` | `admin_dashboard` | `AuthSettingsForm` |
| `/admin/content` | `admin_content` | `ContentEntryAdmin` (pick content type) |
| `/admin/content/:type` | `admin_content` | `ContentEntryAdmin` (edit entries) |

```
GET /admin/content/page
  → JWT required (client auth gate)
  → GET /api/edge/schema/{orgId}?template=admin_content
  → Renderer → AdminShell + ContentEntryAdmin
  → ContentEntryAdmin loads GET /api/documents/content-types, GET /api/documents/:type
  → Save → executeAction("saveContentEntry") → PUT documents API
  → Publish → executeAction("publishContentEntry")
```

Seed: `pnpm seed:demo` creates `page` content type + demo entry + `admin_content` layout.

---

## Phases

1. `AdminShell` + seed admin layouts ✅
2. Protected `/admin` + `/login?redirect=` ✅
3. **Auth settings** — Google OAuth → ZITADEL + Postgres ✅ ([`ORG-AUTH-CONFIG.md`](./ORG-AUTH-CONFIG.md))
4. **Generic content CMS** — `ContentEntryAdmin` (schema-driven, not commerce-specific) ✅
5. Layout editor (publish layout specs from UI) 📋
6. Visual editor lazy chunk (`editor/`) 📋
7. Tenant catalog bundler + MF remotes 📋

---

## Validate

```bash
pnpm seed:demo
# Sign in → http://{orgId}.localhost:5173/admin/content
# Edit "page" entry → Save & publish
# Auth → http://{orgId}.localhost:5173/admin/settings/auth
```

---

## References

- [`docs/2026-07-04/ARCHITECTURE_DECISIONS.md`](../2026-07-04/ARCHITECTURE_DECISIONS.md) — admin as layout templates
- [`docs/2026-07-11/CLIENT_BUNDLE.md`](../2026-07-11/CLIENT_BUNDLE.md) — client + edge flow
- [`SPEC-DRIVEN-UI.md`](./SPEC-DRIVEN-UI.md) — catalog skeleton, adding screens without drift
- [`CONTENT-RENDER-PIPELINE.md`](./CONTENT-RENDER-PIPELINE.md) — CMS → edge `$state` (storefront)
