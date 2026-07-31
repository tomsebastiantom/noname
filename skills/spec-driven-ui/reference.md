# Spec-Driven UI — Reference

Canonical doc: `docs/2026-07-25/SPEC-DRIVEN-UI.md`

---

## Runtime pipeline

```
main.tsx
  slugFromHostname()
  templateFromPath(pathname)     → "home" | "login" | "admin_dashboard" | "admin_content"
  admin JWT gate if needed
  GET /api/edge/schema/yogastore?template={template}&segment=default
  GET /api/tenants/yogastore/catalog  → loadCatalogs(manifest)
  <Renderer spec={layoutTree} registry={mergedRegistry} />
```

---

## Template map (today)

| Path prefix | Template | Layout seed key |
|-------------|----------|-----------------|
| `/login`, `/auth/callback` | `login` | `login` |
| `/admin/content*` | `admin_content` | `admin_content` |
| `/admin*` | `admin_dashboard` | `admin_dashboard` |
| `/` (default) | `home` | `home` |

---

## Data sources (do not mix)

| What | Storage | Edge / client |
|------|---------|---------------|
| Page structure | `layout` document | Spec tree |
| Login/admin copy (titles, descriptions, **buttons**) | Layout **props** | Passed into component — not hardcoded in React |
| Org content on public site | `content` document | `$state` + resolve |
| Provider toggles | `tenant_settings.auth` | Client merge |
| Locale | `tenant_settings.locales` + layout props | Per-org language without TSX changes |

**Rule:** If the user can read it on screen, it is **not** a string literal in `.tsx` (except loading/error fallbacks in `main.tsx` host shell).

---

## Files to touch (quick map)

| Change | Files |
|--------|-------|
| Platform component | `core/catalog-schemas.ts`, `core/components*.tsx`, `platform/registry.ts` |
| Admin panel | `admin/components/{feature}/`, `admin/registry.ts`, `admin/schemas/actions.ts` |
| Platform action | `core/actions/*.ts`, `platform/registry.ts`, `platform/catalog-ui-shell.tsx`, server domain |
| Form submit helper | `core/use-catalog-submit.ts` (already shared — import, don't duplicate) |
| Admin layout | `scripts/seed-demo.ts`, optional `main.tsx` |
| Extension widget | `packages/extensions/src/{name}/` (4 files + index loader) |
| Public auth config | `packages/workers/src/routes/proxy.ts` if new public GET |

---

## json-render expressions & actions

See [SKILL.md — json-render patterns](SKILL.md#json-render-patterns-target-architecture) and [SKILL.md — action wiring](SKILL.md#action-wiring-follow-json-render-official-pattern).

**Official reference:** [json-render/examples](https://github.com/vercel-labs/json-render/tree/main/examples) · [dashboard renderer](https://github.com/vercel-labs/json-render/blob/main/examples/dashboard/lib/render/renderer.tsx) · [devtools](https://github.com/vercel-labs/json-render/tree/main/examples/devtools) (state/actions inspector)

**Runtime wiring (Noname — sync handlers, dashboard pattern):**

```
platform/registry.ts
  defineRegistry → handlers(getSetState, getState)

platform/catalog-ui-shell.tsx
  createStateStore + handlers() → JSONUIProvider handlers={…}

components
  useActions().execute({ action, params })
  useStateValue("/admin/…")
```

| Piece | File | Notes |
|-------|------|-------|
| Handler impl | `core/actions/*.ts` | `(params, setState, state)` |
| Registry | `platform/registry.ts` | export `handlers` from `defineRegistry` |
| Shell | `platform/catalog-ui-shell.tsx` | **sync** `handlers` prop — not `registerHandler` in `useEffect` |
| Load on mount | `MountAction.tsx` | `MountAction` in spec or `useMountAction()` |
| Form submit | `use-catalog-submit.ts` | Editable draft panels — `useCatalogSubmit()` |
| Draft reset after reload | Load handler `loadedAt` + `key={loadedAt}` | Editable draft panels |
| Host | `main.tsx` | `<CatalogUiShell spec={…} registry={…} />` |

- Components — `useActions().execute({ action, params })` and `useStateValue(path)`
- Action handlers — may call `auth/*`, `admin/*` helpers; **components may not**
- Layout spec — prefer `watch` + `$bindState` over imperative `useEffect` when feasible
- `executeAction` from `registry.ts` — tests/scripts only, not components

---

## json-render examples → Noname

Upstream: [vercel-labs/json-render/examples](https://github.com/vercel-labs/json-render/tree/main/examples).  
Noname is **no-AI, hand-authored layout docs** + **real server actions** — not streaming widgets from an LLM. Pick patterns by **UI shape**, not by whether the screen lives under `/admin`.

### Follow closely (already in our stack)

| Example | Link | What it shows | Noname equivalent |
|---------|------|---------------|-------------------|
| **no-ai** | [examples/no-ai](https://github.com/vercel-labs/json-render/tree/main/examples/no-ai) · [registry](https://github.com/vercel-labs/json-render/blob/main/examples/no-ai/lib/render/registry.tsx) | Static `Spec`, no LLM; `$bindState`, `$cond`, `$template`, `$computed`, `watch`, custom actions | **Primary model** — layout seeds / documents API, `Renderer`, catalog schemas. Target: more simple UI in spec (see hybrid table in [SKILL.md](SKILL.md#where-logic-lives-today-hybrid)) |
| **dashboard** | [examples/dashboard](https://github.com/vercel-labs/json-render/tree/main/examples/dashboard) · [renderer](https://github.com/vercel-labs/json-render/blob/main/examples/dashboard/lib/render/renderer.tsx) | `handlers()` factory, typed actions → `fetch`, sync `JSONUIProvider` | **`platform/catalog-ui-shell.tsx`** + **`platform/registry.ts`** — same wiring; ignore AI widget streaming |

### Noname extensions (not in stock json-render — encode these)

Stock examples do **not** cover load-on-mount or editable drafts. We added helpers on top of the same action pipeline:

| UI shape | When | Noname pattern | Shipped example |
|----------|------|----------------|-----------------|
| **Editable draft panel** | Load → local edit → save | `useMountAction` + `loadedAt` + `key={loadedAt}` + `useCatalogSubmit` | [examples.md §1–2](examples.md) |
| **Read-only + actions** | List/detail from server; occasional submit | `MountAction` / `useMountAction` → `$state`; `execute` or hook for mutations | [examples.md §4](examples.md) |
| **Single-shot action** | Login, cart, toggle | `useActions().execute` in component | [examples.md §3, §5](examples.md) |
| **Remote load on mount** | Data not in initial spec | `MountAction` in layout or `useMountAction()` | [SKILL.md — load on mount](SKILL.md#load-on-mount--json-render-has-no-built-in-hook) |

These are **spec-driven UI** patterns, not an admin-only layer — admin is just where most draft panels live today.

### Aspirational (json-render shows the direction)

| Example | Link | Idea | Noname status |
|---------|------|------|---------------|
| **devtools** | [examples/devtools](https://github.com/vercel-labs/json-render/tree/main/examples/devtools) | `@json-render/devtools` — inspect `$state`, actions, streamed patches | Optional later for debugging catalog |
| **devtools** | same | **`spec.state` seeded** before render — components only read `$state` | **Target:** edge preloads into store (today: load actions write `$state`) |
| **no-ai** Forms tab | [lib/examples.ts](https://github.com/vercel-labs/json-render/blob/main/examples/no-ai/lib/examples.ts) | Whole form in spec via `$bindState` + `validateForm` | Move simple forms off custom React when feasible |

### Not our model (skip unless product asks)

| Example | Link | Why skip |
|---------|------|----------|
| **chat**, **harness-chat**, **ink-chat**, **svelte-chat** | [examples/](https://github.com/vercel-labs/json-render/tree/main/examples) | AI chat streaming specs — we author layouts in CMS/seed |
| **dashboard** (generation half) | [app/api/generate](https://github.com/vercel-labs/json-render/tree/main/examples/dashboard/app/api/generate) | LLM widget generation — not layout source of truth |
| **stripe-app** | [examples/stripe-app](https://github.com/vercel-labs/json-render/tree/main/examples/stripe-app) | Stripe Dashboard embedding + AI fallback |
| **game-engine**, **gsplat**, **react-three-fiber*** | under [examples/](https://github.com/vercel-labs/json-render/tree/main/examples) | Alternate render targets — only if we add a 3D extension |
| **react-email**, **react-pdf**, **remotion** | under [examples/](https://github.com/vercel-labs/json-render/tree/main/examples) | Non-React-DOM outputs |
| **react-native**, **vue**, **svelte**, **solid** | under [examples/](https://github.com/vercel-labs/json-render/tree/main/examples) | We ship React web only |
| **mcp**, **image** | under [examples/](https://github.com/vercel-labs/json-render/tree/main/examples) | Tooling demos, not org UI pipeline |

### Quick decision tree

```
New UI need
├── Simple fields, validation, visibility in spec?     → no-ai patterns ($bindState, watch, $cond)
├── One click / submit, no draft?                      → execute (no-ai / dashboard actions)
├── Load server data then show (read-only)?            → MountAction + $state (Noname)
├── Load → edit locally → save?                        → editable draft panel (Noname)
└── LLM generates the layout at runtime?               → not Noname v1 — use seeded layout doc
```

---

## Anti-patterns

| Wrong | Right |
|-------|-------|
| `pages/AdminProducts.tsx` | `ContentEntryAdmin` + content type |
| react-router merchant routes | `templateFromPath` + layout doc |
| `fetch("/api/…")` in component | `useActions().execute({ action, params })` |
| `executeAction()` in component | `useActions().execute()` |
| Manual `registerHandler` in `useEffect` for catalog handlers | Sync `handlers={createHandlers(…)}` on `JSONUIProvider` |
| `useEffect(..., [execute])` to load on mount | `MountAction` in layout spec or `useMountAction(action, params)` — see [SKILL.md — load on mount](SKILL.md#load-on-mount--json-render-has-no-built-in-hook) |
| `useEffect([loaded])` to sync server → local draft | `key={loaded.loadedAt}` inner form; init `useState` from `loaded` props |
| Hand-rolled save try/catch in editable draft panels | `useCatalogSubmit` + `loadedAt`/`key` |
| React `<form action>` / `useActionState` | `execute` or `useCatalogSubmit` (draft panels) |
| `FormEvent` typed submit handlers | Inline `e.preventDefault(); void handleSave()` |
| Per-org config in `.env` | `tenant_settings` or layout |
| Separate admin SPA package | Same `packages/client` Renderer |
| `"Save & publish"` in component TSX | `publishLabel` (and peers) in layout spec props |
| English-only strings in React | Props from layout JSON; locale via `tenant_settings.locales` |

---

## Exceptions (allowed outside Renderer)

- `/auth/callback` — OAuth handler (`auth/callback-page.tsx`)
- `main.tsx` — loading, error, `AuthBar`, auth redirect
- Internal helpers under `admin/`, `auth/` — called from **action handlers** only, not components or routes
