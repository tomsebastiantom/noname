---
name: spec-driven-ui
description: >-
  Builds org-facing UI through the Noname spec pipeline (layout document →
  edge schema → json-render Renderer). Use for any spec-driven surface: login,
  public storefront, extensions, admin panels, catalog components, actions,
  layout seeds, content types, and visual editor — not hand-written React routes.
  Catalog props: config + labels only — read props-contract.md before
  schemas/seeds/components.
---

# Spec-Driven UI

**Platform note:** Noname is identity-agnostic — not e-commerce-only. Use **org** / **org operator** / **public site** in docs and code comments; avoid defaulting to “merchant” or “store” unless the example is commerce.

**Rule:** Every org-facing page loads from **layout spec + catalog** — not a hand-written React route.

```
URL → templateFromPath → layout document → GET /api/edge/schema → <Renderer spec={…} />
```

**Skill files:** [reference.md](reference.md) · [props-contract.md](props-contract.md) · [examples.md](examples.md). Skills describe **how to build** — discover repo paths in the project, not here.

**Props (required):** Every catalog component uses **`config` + `labels` only** — all copy in `labels`, no top-level `title`/`saveLabel`/`label`.

---

## When to use this skill

- Adding `/admin/*`, `/login`, or public-site UI
- Creating a new catalog component or action
- Seeding or publishing layout documents
- Registering a **content type** or content entries (CMS)
- Storefront visual editor (`?edit=true`)
- User asks for "admin page", "settings form", "CMS editor", or "new screen"

**Stop and reject** if the approach is: hand-written React route per screen, a `pages/` tree for org UI, or commerce-specific one-off admin forms.

**Named exception — visual editor (`?edit=true`).** The storefront visual editor does not resolve through `templateFromPath` + edge schema like every other org-facing surface — it lazy-loads a standalone `EditPageView` tree. This is deliberate: the editor's canvas/drag-drop/layer-tree UX is materially more complex than the spec pipeline is designed for. Treat editor-internal code as its own bespoke surface with its own test/perf bar; it does not need to itself be spec-driven the way admin panels and storefront pages do. The exception is for *how the editor loads* — editor code must still never import from `admin/*` (see PR checklist).

---

## Skeleton (catalog layers)

```
catalog-schemas     # Zod component props + action params
components          # render props.labels / $state; MountAction, forms, shells
actions             # (params, setState, state) handlers
registry            # component + action map → json-render defineRegistry
runtime shell       # JSONUIProvider + sync handlers + Renderer
layout documents    # json-render tree (seed or CMS)
host                # template routing, auth gate, load spec + catalog
admin panels        # feature components + admin registry (operator tools)
extensions          # optional storefront packs (schema, components, actions, registry)
```

---

## The persistence layer (CMS/documents) — not part of `@json-render`

**`@json-render` has no opinion on where a spec comes from.** Everything in this section is this platform's own layer on top of the rendering engine — know that it's a deliberate addition, not something the underlying library provides, when extending it.

```
templateFromPath(pathname)
  → layout document (Postgres, via documents domain)
  → GET /api/edge/schema (draft-aware, tenant-scoped)
  → Spec { root, elements, state }
  → <Renderer spec={…} registry={…} />
```

| Concept | Where it lives | Not the same as |
|---|---|---|
| **Layout document** | `documents` domain, one row per template | A `Spec` — becomes one once resolved, not the wire format itself |
| **Content type / entry** | `documents` domain, schema-validated CMS rows | A catalog component prop schema — describes data, not UI |
| **Refs** | `@noname/documents` | A `$state` path — refs resolve server-side before reaching `$state` |
| **Draft vs. published** | A flag on the document; edge schema is draft-aware for editor sessions | Not a renderer concept — the renderer always gets one resolved `Spec` |

Adding a content type, admin panel, or domain touches this layer, not the rendering engine — expect multiple registries/files to stay in sync by hand (nothing currently checks this automatically).

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

**Pattern map:** [reference.md § UI patterns](reference.md#ui-patterns). Follow json-render for catalog, registry, handlers, and expressions.

### The three-layer split (same as json-render)

| Layer | Module | Responsibility |
|-------|--------|----------------|
| **Catalog schema** | catalog schemas | Zod params per action — validates spec + `execute` calls |
| **Handler impl** | action handlers | `(params, setState, state) => Promise<void>` — fetch, then `setState(path, value)` |
| **Runtime wiring** | registry + runtime shell | `defineRegistry` → `handlers()` → `JSONUIProvider handlers={…}` |

```typescript
// catalog registry — same as json-render docs
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
| **Noname** | `createStateStore` + `handlers()` on `JSONUIProvider` in runtime shell |

```tsx
// runtime shell (dashboard pattern — handlers ready before children mount)
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
// host shell
<CatalogUiShell spec={spec} registry={registry} />
```

### Registry composition — no type-erasure

Compose a registry's `components`/`actions` maps as one typed object literal (`{ ...setA, ...setB }`), never a cast. Needing `as never`/`as any` at a `defineRegistry` call means the handler map's declared type doesn't match its catalog — fix the declaration, don't cast around it; a cast disables the compiler check that catches a broken action signature.

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

Implementation: `MountAction` component + `useMountAction` hook in your catalog.

- `execute` stays on a **ref** — never in the effect deps (json-render recreates it when `loadingActions` updates → infinite loop)
- Effect deps: **`[action, params]`** only
- Inline `params` objects must be **`useMemo`**-stable at the call site (e.g. `{ pageKey }` from route params)

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

Implementation: shared `useCatalogSubmit` hook.

### What to call from components

| Call from | Use | Why |
|-----------|-----|-----|
| Catalog component — single-shot or mount load | `useActions().execute({ action, params })` | Goes through `ActionProvider` |
| Catalog component — editable draft save | `useCatalogSubmit()` | Pending/error/success around `execute` |
| Layout spec (`watch`, `action` on Pressable) | Same — resolved by `ActionProvider` | Spec-driven side effects |
| Outside React tree (tests, one-off scripts) | `executeAction(name, params, set, state)` from registry | Imperative, no provider context |
| **Never** in a component registered in a catalog registry | `fetch("/api/…")` directly | Bypasses catalog validation; use action handler helpers. Does **not** apply to host-level files (route page, a data-owning hook) that load data from *outside* the spec tree — matches how `@json-render`'s own hooks (`useUIStream`, `useChatUI`) and example apps work. See [reference.md § Host vs. catalog boundary](reference.md#host-vs-catalog-boundary). |

**Domain helpers** — only **action handlers** (or server) may call them, not components.

### Checklist when adding an action

```
- [ ] Params schema in catalog
- [ ] Handler — (params, setState, state)
- [ ] Merged into catalog registry
- [ ] Component shape: editable draft → `loadedAt` + `key` + `useCatalogSubmit`; else → `execute`
- [ ] Load actions write $state; reads use useStateValue(path)
- [ ] Prefer layout watch/$bindState over useEffect where feasible
- [ ] Mount loads: `MountAction` in spec or `useMountAction` — **never** `[execute]` in deps
```

---

## Build checklist (copy and track)

```
- [ ] 0. Props — config + labels only ([props-contract.md](props-contract.md))
- [ ] 0b. Content type (if CMS) — [reference.md § Content types](reference.md#content-types)
- [ ] 1. Schema — catalog (component props + action params)
- [ ] 2. Component — register in matching catalog registry
- [ ] 3. Actions — handler module → catalog registry
- [ ] 4. Server — domain route if action needs backend
- [ ] 5. Layout — json-render tree in seed or documents API
- [ ] 6. Template — host template map only if new layout name
- [ ] 7. Validate — typecheck, seed, load page in browser
```

---

## Step-by-step

### 1. Schema (`catalog-schemas.ts`)

Add Zod props for the component and params for any new actions.

### 2. Component

- **Platform** (login, layout): core catalog components
- **Operator tools**: admin catalog components + admin registry
- **Storefront widgets**: extension pack
- **Editable draft:** [Editable draft panels](#editable-draft-panels). **Otherwise:** `execute({ action, params })`
- Copy in layout **`props.labels`** or CMS/`$state` — not hardcoded in TSX ([props-contract.md](props-contract.md))

### 3. Action handler

Follow [Action wiring](#action-wiring-follow-json-render-official-pattern) above.

- Add handler in domain actions module — signature `(params, setState, state) => Promise<void>`
- Load actions **write results to `$state`** via `setState(path, value)`; components read with `useStateValue(path)`
- Merge in platform registry
- In components: **`useCatalogSubmit`** for editable drafts; **`useActions().execute`** otherwise — never `fetch`
- **`executeAction`** from `registry.ts` — tests/scripts only

Admin `$state` paths: use a shared constants module (e.g. `/admin/team/users`).

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

Persist layout via seed script or documents API.

### 5. Template routing (host)

Only when a **new layout template name** is required in the host template map.

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

**Wrong:** `"Save & publish"` hardcoded in a layout admin component  
**Wrong:** top-level `props.publishLabel` (legacy flat props)  
**Right:** `props.labels.publishLabel` from layout JSON

---

## Extension UI

1. Extension catalog schema
2. Components, actions, registry
3. Register in extension loader / manifest
4. Enable in tenant catalog manifest — not a custom route
5. Reference component type in layout spec

---

## Validation before done

```bash
pnpm typecheck
pnpm test          # if actions/schemas changed
# re-run layout/content seed if spec changed
```

**PR review checklist — spec-driven UI:**

```
- [ ] No new hand-written route pages for org UI (editor's ?edit=true is the one named exception — see above)
- [ ] No fetch() inside a component registered in admin/editor/platform registry — host/page/hook-level fetch is fine (see boundary above)
- [ ] Copy in props.labels or layout seed — not TSX literals
- [ ] New catalog components: catalogProps(config, labels) — no top-level flat props
- [ ] Mount load: MountAction or useMountAction — never [execute] in a useEffect dep array
- [ ] Editor code does not import admin/* (re-exports, types, or components)
- [ ] Registry composition uses typed object literals — no `as never`/`as any` at defineRegistry boundaries
- [ ] New editor strings: editorShellLabelsSchema + layout seed
- [ ] Interactive UI: keyboard path + aria where applicable
- [ ] New content type / admin panel: confirm every registry touched (admin/registry.ts, admin/schemas/*, platform-routes.ts, auth/admin-routes.ts) — nothing currently checks these stay in sync automatically
```

Manual: load the org URL — page must render from edge schema, not a blank shell.
