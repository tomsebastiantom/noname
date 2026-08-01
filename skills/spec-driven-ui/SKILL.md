---
name: spec-driven-ui
description: >-
  Builds org-facing UI through the Noname spec pipeline (layout document →
  edge schema → json-render Renderer). Use for any spec-driven surface: login,
  public storefront, extensions, admin panels, catalog components, actions,
  and layout seeds — not hand-written React routes. Catalog props: config +
  labels only — read props-contract.md before schemas/seeds/components.
---

# Spec-Driven UI

**Platform note:** Noname is identity-agnostic — not e-commerce-only. Use **org** / **org operator** / **public site** in docs and code comments; avoid defaulting to “merchant” or “store” unless the example is commerce.

**Rule:** Every org-facing page loads from **layout spec + catalog** — not a hand-written React route.

```
URL → templateFromPath → layout document → GET /api/edge/schema → <Renderer spec={…} />
```

Read [reference.md](reference.md) for data-source rules, [json-render example map](reference.md#json-render-examples--noname), and anti-patterns. See [examples.md](examples.md) for shipped patterns.

**Props contract (required):** Every catalog component uses **`config` + `labels` only** — all copy in `labels`, no top-level `title`/`saveLabel`/`label`. Read [props-contract.md](props-contract.md) before changing schemas, seeds, or components.

---

## When to use this skill

- Adding `/admin/*`, `/login`, or public-site UI
- Creating a new catalog component or action
- Seeding or publishing layout documents
- User asks for "admin page", "settings form", "CMS editor", or "new screen"

**Stop and reject** if the approach is: react-router page, `packages/client/src/pages/*`, or commerce-specific admin forms.

---

## Skeleton (core catalog)

```
packages/client/src/core/
├── catalog-schemas.ts       # Zod component props + action params
├── components.tsx             # layout + auth shell only (Grid, LoginForm, MountAction)
├── components/*.tsx           # login views, AuthBar, MountAction
├── admin-state.ts           # $state path constants for admin data
├── use-catalog-submit.ts    # pending/error/success for editable draft panels
└── actions/*.ts             # executeAction handlers

packages/client/src/admin/
├── registry.ts                # admin panel components → json-render map
├── schemas/actions.ts         # admin action Zod schemas
└── components/                # feature folders (auth-settings/, content/, shell/, …)
         ↓
platform/catalog.ts + platform/registry.ts + platform/catalog-ui-shell.tsx
```

Extensions: same four files under `packages/extensions/src/{name}/`.

Host only: `main.tsx` (template routing, auth gate, loading shell). Exception: `/auth/callback`.

---

## json-render patterns (target architecture)

Layout JSON can drive **props**, **visibility**, and **side effects** without imperative React. Prefer these in layout specs; custom catalog components are for complex forms/tables that are not yet spec-composed.

### Dynamic props

Any prop can be data-driven:

```json
{
  "type": "Icon",
  "props": {
    "name": {
      "$cond": { "$state": "/activeTab", "eq": "home" },
      "$then": "home",
      "$else": "home-outline"
    }
  }
}
```

| Expression | Purpose |
|------------|---------|
| `{ "$state": "/path" }` | Read from state model |
| `{ "$cond": …, "$then": …, "$else": … }` | Conditional value |
| `{ "$template": "Hello, ${/user/name}!" }` | String interpolation |
| `{ "$computed": "fn", "args": { … } }` | Registered computed fn |
| `{ "$bindState": "/form/field" }` | Two-way bind (inputs) |

### Actions in spec

Catalog components with `action` / `actionParams` trigger registered handlers. Built-in **`setState`** updates the model and re-evaluates expressions:

```json
{
  "type": "Pressable",
  "props": {
    "action": "setState",
    "actionParams": { "statePath": "/activeTab", "value": "home" }
  },
  "children": ["home-icon"]
}
```

Custom actions (e.g. `publishLayoutEntry`) use the same shape with your action name and params.

### State watchers

React to state changes from the layout (fires on change, **not** on initial render):

```json
{
  "type": "UsersAdminForm",
  "watch": {
    "/admin/team/refresh": {
      "action": "listTeamUsers"
    }
  }
}
```

Use watchers to replace `useEffect` load triggers where the spec owns lifecycle.

### Where logic lives today (hybrid)

| Concern | Prefer in layout spec | Still in custom component |
|---------|----------------------|---------------------------|
| Copy (titles, labels) | Layout **props** → `labels` bucket | — |
| Tab/nav highlight | `$state` + `$cond` on props | — |
| Load list on mount | `MountAction` in layout spec or `useMountAction()` | `useEffect` + `execute` in panel (avoid) |
| Form field state | `$bindState` | Local `useState` (complex editors) |
| Form submit | Local draft + save via catalog action | `useCatalogSubmit()` — see [Editable draft panels](#editable-draft-panels) |
| Read-only or single-shot action | Login, toggle, add-to-cart | `execute({ action, params })` directly |
| API calls | Action handlers | Handlers only — components call `execute`, never `fetch` |

---

## Action wiring (follow json-render official pattern)

**Official catalog:** [json-render/examples](https://github.com/vercel-labs/json-render/tree/main/examples) — full map in [reference.md — json-render examples → Noname](reference.md#json-render-examples--noname).

Follow json-render for catalog, registry, handlers, and expressions. Noname adds layout documents, edge fetch, and a few lifecycle helpers (see map below).

### The three-layer split (same as json-render)

| Layer | Where | Responsibility |
|-------|-------|----------------|
| **Catalog schema** | `catalog-schemas.ts` | Zod params per action — validates spec + `execute` calls |
| **Handler impl** | `core/actions/*.ts` | `(params, setState, state) => Promise<void>` — fetch, then `setState(path, value)` |
| **Runtime wiring** | `platform/registry.ts` + `catalog-ui-shell.tsx` | `defineRegistry` → `handlers()` → `JSONUIProvider handlers={…}` |

```typescript
// platform/registry.ts — same as json-render docs
export const { registry, handlers, executeAction } = defineRegistry(catalog, {
  components: coreComponents,
  actions: coreActionHandlers,
});
```

### Action handlers (sync via `JSONUIProvider`)

json-render's `handlers(getSetState, getState)` factory must be available **on first render** — not via `registerHandler` in `useEffect`. Child components that call `useActions().execute` in `useEffect` run in the same tick; async handler registration loses the race.

| json-render example | Pattern |
|---------------------|---------|
| **no-ai** | Static `handlers={…}` on `JSONUIProvider` (no `$state`) |
| **dashboard** | `handlers()` factory + refs on `ActionProvider` |
| **devtools** | Shared store + `$state` paths; inspect via `@json-render/devtools` |
| **Noname** | `createStateStore` + `handlers()` passed to `JSONUIProvider` in `catalog-ui-shell.tsx` |

```tsx
// platform/catalog-ui-shell.tsx (dashboard pattern — handlers ready before children mount)
const store = createStateStore({});
const actionHandlers = useMemo(
  () => createHandlers(() => store.set.bind(store) as SetState, () => store.getSnapshot()),
  [store],
);

<JSONUIProvider registry={registry} store={store} handlers={actionHandlers}>
  <Renderer spec={spec} registry={registry} />
</JSONUIProvider>
```

Do **not** use `registerHandler` in `useEffect` for initial catalog handlers.

```tsx
// main.tsx
<CatalogUiShell spec={spec} registry={registry} />
```

### Load on mount — json-render has no built-in hook

Official json-render examples **do not** load remote data inside catalog components on mount:

| Example | How data appears |
|---------|------------------|
| **no-ai** | User clicks buttons → `action` in spec |
| **dashboard** | Parent React state passed in; handlers update via user actions |
| **devtools** | AI streams spec + **`spec.state` seeded** into store (no fetch in components) |
| **`watch`** | Fires only when a watched path **changes** — not on first render |

So panels that **load remote data into `$state`** are outside what stock json-render examples cover. json-render's own `useAction()` still lists `execute` in deps — same infinite-loop risk if misused.

**Noname pattern — `MountAction` + `useMountAction`:**

| Use | When |
|-----|------|
| **`MountAction` in layout spec** | Static load (e.g. team members list) |
| **`useMountAction(action, params?)` in panel** | Load depends on URL or other React state |

Implementation: `packages/client/src/core/components/MountAction.tsx`

- `execute` stays on a **ref** — never in the effect deps (json-render recreates it when `loadingActions` updates → infinite loop)
- Effect deps: **`[action, params]`** only
- Inline `params` objects must be **`useMemo`**-stable at the call site (e.g. `{ pageKey }` in `PageEntryAdmin`)

**Layout spec (team members):**

```json
"shell": { "children": ["loadTeam", "usersAdmin"] },
"loadTeam": { "type": "MountAction", "props": { "action": "listTeamUsers" } }
```

**Panel with dynamic params:**

```tsx
const loadParams = useMemo(() => (pageKey ? { pageKey } : null), [pageKey]);
useMountAction(pageKey ? "loadRoutingPage" : "listRoutingPages", loadParams);
```

**Wrong:** `useEffect(..., [execute])` for mount loads. **`watch` alone** does not run on first render.

### Editable draft panels

**When:** load → local draft → save ([examples](examples.md) — auth settings, content CMS).  
**When not:** read-only list, single-shot action (team list, login, addToCart).

1. **Load** — `useMountAction` → handler writes `$state` with **`loadedAt`**
2. **Draft** — inner component init from `loaded`; parent **`key={loaded.loadedAt}`** (not `useEffect` sync)
3. **Save** — **`useCatalogSubmit()`** for pending/error/success around `execute`

Skip steps 2–3 for other shapes.

```tsx
const { submit, run, executeAction, pending, error, success } = useCatalogSubmit();

await submit({
  action: "saveAuthConfig",
  params: { … },
  successMessage: props.successMessage,
});

// Multi-step save then publish — use run + executeAction, not nested submit()
await run(
  async () => {
    await executeAction("saveLayoutEntry", { id, specJson });
    await executeAction("publishLayoutEntry", { id });
  },
  { successMessage: props.publishedMessage, onPendingChange: setPublishing },
);

const displayError = mergeCatalogError(error, loadError);
```

Load handler attaches `loadedAt`:

```tsx
function FormFields({ loaded }: { loaded: MyLoaded }) {
  const [values, setValues] = useState(loaded.values);
  // …
}

<FormFields key={loaded.loadedAt} loaded={loaded} … />
```

**Forms:** inline `onSubmit` with `preventDefault` — no `FormEvent`.

Implementation: `core/use-catalog-submit.ts`.

### What to call from components

| Call from | Use | Why |
|-----------|-----|-----|
| Catalog component — single-shot or mount load | `useActions().execute({ action, params })` | Goes through `ActionProvider` |
| Catalog component — editable draft save | `useCatalogSubmit()` | Pending/error/success around `execute` |
| Layout spec (`watch`, `action` on Pressable) | Same — resolved by `ActionProvider` | Spec-driven side effects |
| Outside React tree (tests, one-off scripts) | `executeAction(name, params, set, state)` from `registry.ts` | Imperative, no provider context |
| **Never** in components | `fetch("/api/…")` directly | Bypasses catalog validation; use action handler that calls `auth/*` or `admin/*` helpers |

**Helpers** under `auth/`, `admin/` are fine — but only **action handlers** (or server) should call them, not components.

### Checklist when adding an action

```
- [ ] Params schema in catalog-schemas.ts
- [ ] Handler in core/actions/{domain}.ts — (params, setState, state)
- [ ] Merged into coreActionHandlers → platform/registry.ts
- [ ] Component shape: editable draft → `loadedAt` + `key` + `useCatalogSubmit`; else → `execute`
- [ ] Load actions write $state; reads use useStateValue(path)
- [ ] Prefer layout watch/$bindState over useEffect where feasible
- [ ] Mount loads: `MountAction` in spec or `useMountAction` — **never** `[execute]` in deps
```

---

## Build checklist (copy and track)

```
- [ ] 0. Props — config + labels only ([props-contract.md](props-contract.md))
- [ ] 1. Schema — catalog-schemas.ts (component + actions)
- [ ] 2. Component — `core/components/`, `admin/components/`, or `extensions/`; register in the matching registry
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

- **Platform** (login, layout): `core/components/` → `core/components.tsx`
- **Operator tools**: `admin/components/{feature}/` → `admin/registry.ts`
- **Storefront widgets**: `extensions/src/{name}/`
- **Editable draft:** [Editable draft panels](#editable-draft-panels). **Otherwise:** `execute({ action, params })`
- Copy in layout **`props.labels`** or CMS/`$state` — not hardcoded in TSX ([props-contract.md](props-contract.md))

### 3. Action handler

Follow [Action wiring](#action-wiring-follow-json-render-official-pattern) above.

- Add handler in `core/actions/{domain}.ts` — signature `(params, setState, state) => Promise<void>`
- Load actions **write results to `$state`** via `setState(path, value)`; components read with `useStateValue(path)`
- Merge in `platform/registry.ts` via `coreActionHandlers`
- In components: **`useCatalogSubmit`** for editable drafts; **`useActions().execute`** otherwise — never `fetch`
- **`executeAction`** from `registry.ts` — tests/scripts only

Admin `$state` paths live in `core/admin-state.ts` (e.g. `/admin/team/users`).

```
MountAction / useMountAction → execute({ action: "listTeamUsers" })
      → ActionProvider → handler(params, setState) → fetch → setState("/admin/team/users", rows)
      → useStateValue("/admin/team/users") re-renders component
```

### 4. Layout document

Store json-render tree as a **layout** template (Postgres / seed):

```json
{
  "root": "shell",
  "elements": {
    "shell": {
      "type": "AdminShell",
      "props": {
        "config": { "activeNav": "…" },
        "labels": { "title": "…", "nav": { "home": "Dashboard" } }
      },
      "children": ["panel"]
    },
    "panel": {
      "type": "MyPanel",
      "props": {
        "config": { "locale": "en" },
        "labels": { "title": "…", "description": "…", "saveLabel": "Save draft" }
      }
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

**No user-visible text in React.** Components render `props.labels` and resolved CMS/`$state` — they do not own copy. Full rules: [props-contract.md](props-contract.md).

| UI kind | Text source | Example |
|---------|-------------|---------|
| Admin / login chrome | Layout **`props.labels`** | `labels.title`, `labels.saveLabel`, `labels.views.login.title` |
| Storefront body | CMS **content** → `$state` | Product title, hero text (commerce examples) |
| Auth behavior (enabled providers) | API + **`$state`** | Which buttons show — not button copy |
| Locale / language | Per-locale layout docs or `labels` in spec (v1) | No TSX changes |
| Side effects | **Actions** via `useActions().execute` | `execute({ action: "publishLayoutEntry", params: { id } })` |
| Admin list/detail data | **$state** (load actions write, components read) | `useStateValue("/admin/team/users")` |

**Wrong:** `"Save & publish"` inside `LayoutEntryAdmin.tsx`  
**Wrong:** top-level `props.publishLabel` (legacy flat props)  
**Right:** `props.labels.publishLabel` from layout JSON

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

Manual: load `yogastore.localhost:5173/{path}` — page must render from edge schema, not a blank React shell.

---

## Docs (repo)

- Full guide: `docs/2026-07-25/SPEC-DRIVEN-UI.md`
- Routing: `docs/2026-07-25/PAGE-ROUTING.md`
- Admin routes: `docs/2026-07-25/ADMIN-UI-LATER.md`
- Actions: `docs/2026-07-25/CLIENT-ACTIONS.md`
- Layers: `docs/2026-07-25/CLIENT-CATALOG-LAYERS.md`
