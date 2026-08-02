# Spec-Driven UI — Reference

**Catalog props:** [props-contract.md](props-contract.md) — `config` + `labels` only; all copy in `labels`.

---

## Runtime pipeline

```
Host shell
  resolve org + route → layout template name
  auth gate if needed
  GET edge schema (layout spec + catalog manifest)
  <Renderer spec={layoutTree} registry={mergedRegistry} />
```

---

## Template routing

Map URL prefixes to **layout template names** (stored as layout documents):

| Path prefix (example) | Template name |
|-----------------------|---------------|
| `/login`, `/auth/callback` | `login` |
| `/admin/content*` | `admin_content` |
| `/admin*` | `admin_dashboard` |
| `/` (default) | `home` |

Add a new template only when an existing one cannot host the screen.

---

## Data sources (do not mix)

| What | Storage | Client |
|------|---------|--------|
| Page structure | **Layout** document | Spec tree |
| Login/admin copy | Layout **`props.labels`** | Not hardcoded in React |
| Public site body | **Content** document | `$state` + resolve |
| Editor UI prefs (per user) | **`editor_prefs`** content | Client prefs module |
| Visual editor chrome | **`visual_editor`** layout labels | Label schema + layout seed |
| Provider toggles | **Tenant settings** (auth) | Client merge |
| Locale | Tenant settings + layout props | Per-org without TSX changes |

**Rule:** If the user can read it on screen, it is **not** a string literal in components (except host loading/error fallbacks).

---

## Catalog layers (what to build)

| Layer | Responsibility |
|-------|----------------|
| **Catalog schema** | Zod props per component + params per action |
| **Components** | Render `props.labels` / `$state`; call `execute` or submit helpers |
| **Action handlers** | `(params, setState, state)` — fetch, then `setState` |
| **Registry** | Map component + action names to implementations |
| **Runtime shell** | Sync `handlers` on `JSONUIProvider` before first render |
| **Layout document** | json-render tree — copy in `props.labels`, structure in spec |
| **Host** | Template routing, auth gate, load spec + catalog |

**Extension pack:** same four pieces (schema, components, actions, registry) + manifest entry — no new route.

---

## json-render expressions & actions

See [SKILL.md — json-render patterns](SKILL.md#json-render-patterns-target-architecture) and [SKILL.md — action wiring](SKILL.md#action-wiring-follow-json-render-official-pattern).

**Runtime wiring (sync handlers):**

```
registry → defineRegistry → handlers(getSetState, getState)
runtime shell → createStateStore + handlers() → JSONUIProvider handlers={…}
components → useActions().execute({ action, params }) · useStateValue(path)
```

| Piece | Notes |
|-------|-------|
| Handler impl | `(params, setState, state)` — only layer that calls APIs |
| Registry | Export `handlers` from `defineRegistry` |
| Runtime shell | **Sync** `handlers` prop — not `registerHandler` in `useEffect` |
| Mount load | `MountAction` in spec or `useMountAction()` hook |
| Editable draft save | `useCatalogSubmit()` + `loadedAt` + `key={loadedAt}` |
| Host | `<CatalogUiShell spec={…} registry={…} />` |

- Components — `execute` and `useStateValue` only; **never** raw `fetch`
- Prefer layout `watch` + `$bindState` over `useEffect` where feasible
- `executeAction` — tests/scripts only, not components

---

## UI patterns

Hand-authored layout specs + server actions — not runtime LLM-generated UI. Pick by **UI shape**:

| UI shape | When | Pattern | Example |
|----------|------|---------|---------|
| Editable draft panel | Load → edit → save | `useMountAction` + `loadedAt` + `key` + `useCatalogSubmit` | [examples.md §1–2](examples.md) |
| Read-only + actions | List/detail from server | `MountAction` / `useMountAction` → `$state` | [examples.md §4](examples.md) |
| Single-shot action | Login, cart, toggle | `useActions().execute` | [examples.md §3, §5](examples.md) |
| Remote load on mount | Data not in initial spec | `MountAction` or `useMountAction` | [SKILL.md — load on mount](SKILL.md#load-on-mount--json-render-has-no-built-in-hook) |
| Simple fields in spec | Validation, visibility | `$bindState`, `watch`, `$cond` | Layout JSON |
| Sync action handlers | All catalog actions | `handlers()` at first render | Runtime shell |

### Decision tree

```
New UI need
├── Simple fields, validation, visibility in spec?  → $bindState, watch, $cond
├── One click / submit, no draft?                 → execute
├── Load server data then show (read-only)?       → MountAction + $state
├── Load → edit locally → save?                   → editable draft panel
└── LLM generates layout at runtime?              → not v1 — use seeded layout doc
```

**Skip unless product asks:** AI chat streaming specs, LLM layout generation, alternate render targets (native, PDF, 3D).

### Upstream (json-render on GitHub)

| Upstream | URL | Use for |
|----------|-----|---------|
| **no-ai** | https://github.com/vercel-labs/json-render/tree/main/examples/no-ai | Static spec, `$bindState`, `$cond`, `watch`, custom actions |
| **dashboard** | https://github.com/vercel-labs/json-render/tree/main/examples/dashboard | `handlers()` factory, sync `JSONUIProvider` |
| **devtools** | https://github.com/vercel-labs/json-render/tree/main/examples/devtools | Inspecting `$state` / actions (optional) |

This stack adds layout documents, edge fetch, `MountAction`, and editable drafts — see [examples.md](examples.md).

---

## Content types

Names: lowercase `snake_case`, match `^[a-z0-9_]+$`.

| Data | Store in | Not in |
|------|----------|--------|
| Page blocks / layout fields | Layout document | content type |
| Public copy, catalog rows | Content type + entries | layout spec |
| Org config | Tenant settings | content |
| Per-user editor UI | `editor_prefs` (one row per user) | layout |

**Checklist:** exported constant for type name → field schema → bootstrap in seed/migration → REST `/api/documents/{type}`.

---

## Visual editor

Storefront builder: `?edit=true` on public URLs (JWT with draft permission). **Not** admin panels — use editable draft panels ([examples.md](examples.md)).

| Concern | Source |
|---------|--------|
| Chrome copy | `visual_editor` layout → shell component `props.labels` |
| Label keys | Component label schema (Zod) + layout seed |
| Panel prefs | `editor_prefs` content type |
| Page blocks | Layout draft API |
| CMS fields | Content draft API |

After new label keys: update label schema **and** layout seed. Editor layer must not import admin modules — use editor-scoped API shims.

---

## Anti-patterns

| Wrong | Right |
|-------|-------|
| Hand-written route page per screen | Layout template + catalog component |
| react-router page tree for org UI | Template map + layout document |
| `fetch("/api/…")` in component | `useActions().execute({ action, params })` |
| `executeAction()` in component | `useActions().execute()` |
| `registerHandler` in `useEffect` | Sync `handlers={…}` on `JSONUIProvider` |
| `useEffect(..., [execute])` for mount load | `MountAction` or `useMountAction` |
| `useEffect([loaded])` to sync draft | `key={loaded.loadedAt}` |
| Hand-rolled save try/catch in drafts | `useCatalogSubmit` |
| `"Save & publish"` in TSX | `props.labels.publishLabel` in layout |
| Flat `title`, `saveLabel` at props root | `labels.title`, `labels.saveLabel` — [props-contract.md](props-contract.md) |
| Per-org config in `.env` | Tenant settings or layout |
| Separate admin SPA | Same Renderer + catalog |

---

## Exceptions (allowed outside Renderer)

- OAuth callback route — thin handler only
- Host shell — loading, error, auth redirect
- Domain helpers — called from **action handlers** only, not components
