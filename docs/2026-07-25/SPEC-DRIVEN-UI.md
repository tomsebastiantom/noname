# Spec-Driven UI — How to Build Without Drift

> **Date:** 2026-07-25  
> **Status:** Active — **read this before adding any merchant-facing UI**  
> **Related:** [`CLIENT-CATALOG-LAYERS.md`](./CLIENT-CATALOG-LAYERS.md), [`CLIENT-ACTIONS.md`](./CLIENT-ACTIONS.md), [`ADMIN-UI-LATER.md`](./ADMIN-UI-LATER.md)

---

## Rule (non-negotiable)

**Every page the merchant sees is loaded from a layout spec + catalog — not a hand-written React route.**

```
URL path  →  page_tree (storefront) OR platform template (admin/login)
         →  layout document  →  json-render <Renderer>
```

Storefront routing plan: [`PAGE-ROUTING.md`](./PAGE-ROUTING.md). Today storefront still uses `templateFromPath("home")` — temporary.

If you add a new `/admin/foo` page as a standalone React component with its own form, it will **drift** from the platform: no edge cache, no visual editor, no seed/publish flow, no action schema validation.

The only exceptions today:

| Exception | Why |
|-----------|-----|
| `/auth/callback` | OAuth redirect handler — not a merchant page |
| `main.tsx` shell | Loading state, auth gate, `AuthBar` — host chrome only |

Everything else — login, storefront, admin — goes through the same pipeline.

---

## The skeleton (core catalog folder)

Platform UI lives in **`packages/client/src/core/`**. This is the skeleton every page composes from:

```
packages/client/src/core/
├── catalog-schemas.ts   ← Zod: allowed component props + action params
├── components.tsx       ← React implementations (Grid, LoginForm, AdminShell, …)
├── components/          ← Larger components (AuthSettingsForm, ContentEntryAdmin)
└── actions/             ← Side effects: login, saveAuthConfig, saveContentEntry, navigate
         │
         ▼
platform/catalog.ts      ← defineCatalog(core schemas)
platform/registry.ts     ← defineRegistry(catalog, components, actions)
```

Extensions follow the same four files under `packages/extensions/src/{name}/`.

**Do not** create `packages/client/src/pages/AdminFoo.tsx` or wire react-router for merchant UI.

---

## Runtime load (what `main.tsx` does)

```typescript
// 1. Path → layout template (documents segment name)
templateFromPath("/admin/settings/auth")  →  "admin_dashboard"
templateFromPath("/admin/content/page")   →  "admin_content"
templateFromPath("/login")                →  "login"
templateFromPath("/")                     →  "home"

// 2. Fetch resolved layout tree from edge (path segment = store slug, not numeric org id)
GET /api/edge/schema/yogastore?template={template}&segment=default

// 3. Fetch catalog manifest (which extensions to merge)
GET /api/tenants/yogastore/catalog

// 4. Render
<JSONUIProvider registry={mergedRegistry}>
  <Renderer spec={layoutTree} registry={mergedRegistry} />
</JSONUIProvider>
```

Admin routes only add: JWT gate → redirect to `/login?redirect=…`. No separate admin app.

---

## Where text and config live

Pick **one** source per kind of data — mixing them causes drift and wrong cache behavior.

| What | Storage | Example | Resolved on |
|------|---------|---------|-------------|
| **Page structure** (which components, order) | `layout` document | `AdminShell` → `ContentEntryAdmin` | Edge returns spec as-is (login/admin) or after content merge (storefront) |
| **Layout chrome copy** (titles, descriptions in spec props) | Layout spec **props** | `LoginForm.title`, `AdminShell.title` | Edge — no CMS |
| **Merchant content** (product title, page body) | `content` document | `page` entry fields | Edge `$state` + `resolveElementProps` |
| **Auth behavior** (providers on/off) | `tenant_settings.auth` | `providers: ["google"]` | Client merges into `LoginForm` / `AuthSettingsForm` via API |
| **Button labels in platform** | Component code | `"Continue with Google"` | Not merchant-editable |
| **Side effects** | Action handlers | `saveAuthConfig`, `addToCart` | `executeAction` → `core/actions` or extension |

See [`ARCHITECTURE-MAP.md`](./ARCHITECTURE-MAP.md) § “Two page types”.

**Login / admin:** copy in layout props or settings — **not** CMS content entries.  
**Storefront:** copy in CMS — **not** baked into layout JSON.

---

## Adding a new admin (or login) screen

Checklist — same order every time:

### 1. Schema (`catalog-schemas.ts`)

Declare the component and any new actions in Zod:

```typescript
MyAdminPanel: {
  props: z.object({ title: z.string(), description: z.string().nullable() }),
  description: "…",
},
saveMySettings: {
  params: z.object({ … }),
  description: "…",
},
```

### 2. Component (`core/components/` + `components.tsx`)

Implement the React UI. Forms call **`executeAction("saveMySettings", params)`** — never fetch API URLs ad hoc from random paths.

### 3. Action handler (`core/actions/my-domain.ts`)

Register in `platform/registry.ts`. Server calls go through existing action modules (e.g. `core/actions/auth.ts` → server routes).

### 4. Layout document (Postgres)

Add or extend a **layout template** — json-render tree stored via documents API / seed:

```json
{
  "root": "shell",
  "elements": {
    "shell": {
      "type": "AdminShell",
      "props": { "title": "My settings", "activeNav": "my" },
      "children": ["panel"]
    },
    "panel": {
      "type": "MyAdminPanel",
      "props": { "title": "…", "description": "…" }
    }
  }
}
```

Seed example: `scripts/seed-demo.ts` → `adminDashboardSpec`, `adminContentSpec`.

### 5. Template routing (`main.tsx`)

If the screen needs its **own** layout document name, add one line to `templateFromPath`:

```typescript
if (pathname.startsWith("/admin/my")) return "admin_my";
```

Prefer **reusing** `admin_dashboard` / `admin_content` and swapping the inner component via a new layout variant or segment later — fewer templates = less drift.

### 6. Do **not**

- Add react-router routes with full page components
- Put merchant copy only in React default props (use layout spec props so publish/seed can change it)
- Call server endpoints directly from components when an action schema exists
- Create commerce-specific admin under `/admin/products` — use generic `ContentEntryAdmin` + content types

---

## Storefront vs admin (same engine)

| | Storefront `home` | Admin `admin_content` |
|--|-------------------|------------------------|
| Template | `home` | `admin_content` |
| Layout doc | `layout/home/default` | `layout/admin_content/default` |
| Content resolve | Yes — `$state` from CMS | No — admin forms fetch documents API inside component |
| Catalog | core + enabled extensions | core only (today) |
| Auth | Public | JWT required |

Both render with `<Renderer spec={…} />`. Admin is not a separate SPA.

---

## Anti-patterns (causes drift)

| Drift | Correct approach |
|-------|------------------|
| New React page per admin section | New component in catalog + layout spec |
| Hardcoded product form in admin | `ContentEntryAdmin` + content type schema |
| Env vars for per-org UI config | `tenant_settings` or layout documents |
| Direct `fetch("/api/…")` in buttons | `executeAction("…")` with Zod params |
| Duplicate login UI outside `LoginForm` | Login layout spec + `LoginForm` in core catalog |
| Building `/admin` in a new package | Stay in `packages/client` — one bundle, one renderer |

---

## Quick reference — files to touch

| Change | Files |
|--------|-------|
| New platform component | `catalog-schemas.ts`, `components.tsx`, optionally `components/*.tsx` |
| New platform action | `core/actions/*.ts`, `platform/registry.ts`, server domain if needed |
| New admin page layout | `scripts/seed-demo.ts` (or documents API), `main.tsx` if new template |
| New extension widget | `packages/extensions/src/{name}/` (same 4-file pattern) |
| Where copy goes | Layout spec props **or** CMS — see table above |

---

## References

- [`skills/spec-driven-ui/SKILL.md`](../../skills/spec-driven-ui/SKILL.md) — agent skill (editor-agnostic checklist + workflow)
- [`CLIENT-CATALOG-LAYERS.md`](./CLIENT-CATALOG-LAYERS.md) — core vs extension folder layout
- [`CLIENT-ACTIONS.md`](./CLIENT-ACTIONS.md) — `executeAction` flow
- [`CONTENT-RENDER-PIPELINE.md`](./CONTENT-RENDER-PIPELINE.md) — storefront CMS → `$state`
- [`ADMIN-UI-LATER.md`](./ADMIN-UI-LATER.md) — admin routes and shipped components
- [`EXTENSION-LIFECYCLE.md`](./EXTENSION-LIFECYCLE.md) — extension checklist
- [`PAGE-ROUTING.md`](./PAGE-ROUTING.md) — move storefront URLs out of React into page_tree
