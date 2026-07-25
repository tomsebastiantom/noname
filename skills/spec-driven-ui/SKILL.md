---
name: spec-driven-ui
description: >-
  Builds merchant-facing UI through the Noname spec pipeline (layout document →
  edge schema → json-render Renderer). Use when adding admin pages, login screens,
  storefront components, catalog schemas, executeAction handlers, layout seeds,
  or any UI in packages/client. Prevents drift from ad-hoc React routes.
---

# Spec-Driven UI

**Rule:** Every merchant page loads from **layout spec + catalog** — not a hand-written React route.

```
URL → templateFromPath → layout document → GET /api/edge/schema → <Renderer spec={…} />
```

Read [reference.md](reference.md) for data-source rules and anti-patterns. See [examples.md](examples.md) for shipped patterns.

---

## When to use this skill

- Adding `/admin/*`, `/login`, or storefront UI
- Creating a new catalog component or action
- Seeding or publishing layout documents
- User asks for "admin page", "settings form", "CMS editor", or "new screen"

**Stop and reject** if the approach is: react-router page, `packages/client/src/pages/*`, or commerce-specific admin forms.

---

## Skeleton (core catalog)

```
packages/client/src/core/
├── catalog-schemas.ts    # Zod component props + action params
├── components.tsx        # exports + small components
├── components/*.tsx      # larger panels (AuthSettingsForm, ContentEntryAdmin)
└── actions/*.ts          # executeAction handlers
         ↓
platform/catalog.ts + platform/registry.ts
```

Extensions: same four files under `packages/extensions/src/{name}/`.

Host only: `main.tsx` (template routing, auth gate, loading shell). Exception: `/auth/callback`.

---

## Build checklist (copy and track)

```
- [ ] 1. Schema — catalog-schemas.ts (component + actions)
- [ ] 2. Component — core/components/ + export in components.tsx
- [ ] 3. Actions — core/actions/*.ts → register in platform/registry.ts
- [ ] 4. Server — domain route if action needs backend (packages/server)
- [ ] 5. Layout — json-render tree in seed or documents API
- [ ] 6. Template — main.tsx templateFromPath only if new layout name
- [ ] 7. Validate — typecheck, seed, load page in browser
```

---

## Step-by-step

### 1. Schema (`catalog-schemas.ts`)

Add Zod props for the component and params for any new actions.

### 2. Component

- Implement in `core/components/{Name}.tsx`
- Export from `components.tsx` and register in `coreComponents` map
- Forms call **`executeAction("actionName", params)`** — not raw `fetch` to API paths

### 3. Action handler

- Add handler in `core/actions/{domain}.ts`
- Merge in `platform/registry.ts`
- Server side: one path through existing domains (auth, documents, etc.)

### 4. Layout document

Store json-render tree as a **layout** template (Postgres / seed):

```json
{
  "root": "shell",
  "elements": {
    "shell": {
      "type": "AdminShell",
      "props": { "title": "…", "activeNav": "…" },
      "children": ["panel"]
    },
    "panel": {
      "type": "MyPanel",
      "props": { "title": "…", "description": "…" }
    }
  }
}
```

Seed: `scripts/seed-demo.ts` (`adminDashboardSpec`, `adminContentSpec`).

### 5. Template routing (`main.tsx`)

Only when a **new layout template name** is required:

```typescript
if (pathname.startsWith("/admin/my")) return "admin_my";
```

Prefer reusing `admin_dashboard` / `admin_content` / `login` / `home`.

### 6. Where copy lives

| UI kind | Text source |
|---------|-------------|
| Login / admin chrome | Layout spec **props** |
| Product / page body | CMS **content** → `$state` (storefront only) |
| Auth toggles | `tenant_settings.auth` via API |
| Side effects | **Actions** only |

---

## Extension UI (commerce, etc.)

1. `packages/extensions/src/{name}/catalog-schemas.ts`
2. `components.tsx`, `actions.ts`, `registry.ts`
3. Register loader in `packages/extensions/src/index.ts`
4. Enable in tenant catalog manifest — not hardcoded in client routes
5. Reference in layout spec (`ProductCard`, not a custom page)

---

## Validation before done

```bash
pnpm typecheck
pnpm test          # if actions/schemas changed
pnpm seed:demo     # if layout/seed changed
```

Manual: load `{orgId}.localhost:5173/{path}` — page must render from edge schema, not a blank React shell.

---

## Docs (repo)

- Full guide: `docs/2026-07-25/SPEC-DRIVEN-UI.md`
- Admin routes: `docs/2026-07-25/ADMIN-UI-LATER.md`
- Actions: `docs/2026-07-25/CLIENT-ACTIONS.md`
- Layers: `docs/2026-07-25/CLIENT-CATALOG-LAYERS.md`
