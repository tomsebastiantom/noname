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
| Platform action | `core/actions/*.ts`, `platform/registry.ts`, `platform/catalog-action-bridge.tsx`, server domain |
| Admin layout | `scripts/seed-demo.ts`, optional `main.tsx` |
| Extension widget | `packages/extensions/src/{name}/` (4 files + index loader) |
| Public auth config | `packages/workers/src/routes/proxy.ts` if new public GET |

---

## json-render expressions & actions

See [SKILL.md — json-render patterns](SKILL.md#json-render-patterns-target-architecture) and [SKILL.md — action wiring](SKILL.md#action-wiring-follow-json-render-official-pattern).

**Official reference:** [json-render/examples](https://github.com/vercel-labs/json-render/tree/main/examples) · [no-ai registry](https://github.com/vercel-labs/json-render/blob/main/examples/no-ai/lib/render/registry.tsx) · [dashboard renderer](https://github.com/vercel-labs/json-render/blob/main/examples/dashboard/lib/render/renderer.tsx)

**Runtime wiring (Noname — matches dashboard refs + `handlers()` factory):**

```
platform/registry.ts
  defineRegistry(catalog, { components, actions: coreActionHandlers })
  → { registry, handlers, executeAction }

platform/catalog-action-bridge.tsx  (inside JSONUIProvider)
  refs → handlers(() => setRef.current, () => getStateRef.current)
  → registerHandler(name, fn) for each bound handler

components
  useActions().execute({ action, params })
  useStateValue("/admin/…")
```

| Piece | File | Notes |
|-------|------|-------|
| Handler impl | `core/actions/*.ts` | `(params, setState, state)` — may call `auth/*`, `admin/*` |
| Registry | `platform/registry.ts` | `defineRegistry` — do not skip `handlers` export |
| Bridge | `platform/catalog-action-bridge.tsx` | Refs + `handlers()` — do not re-wrap handlers manually |
| Mount | `main.tsx` | `<CatalogActionBridge />` as child of `JSONUIProvider` |

- Components — `useActions().execute({ action, params })` and `useStateValue(path)`
- Action handlers — may call `auth/*`, `admin/*` helpers; **components may not**
- Layout spec — prefer `watch` + `$bindState` over imperative `useEffect` when feasible
- `executeAction` from `registry.ts` — tests/scripts only, not components

---

## Anti-patterns

| Wrong | Right |
|-------|-------|
| `pages/AdminProducts.tsx` | `ContentEntryAdmin` + content type |
| react-router merchant routes | `templateFromPath` + layout doc |
| `fetch("/api/…")` in component | `useActions().execute({ action, params })` |
| `executeAction()` in component | `useActions().execute()` |
| Manual `registerHandler` wrapping `coreActionHandlers` | Use `handlers()` factory from `defineRegistry` |
| Per-org config in `.env` | `tenant_settings` or layout |
| Separate admin SPA package | Same `packages/client` Renderer |
| `"Save & publish"` in component TSX | `publishLabel` (and peers) in layout spec props |
| English-only strings in React | Props from layout JSON; locale via `tenant_settings.locales` |

---

## Exceptions (allowed outside Renderer)

- `/auth/callback` — OAuth handler (`auth/callback-page.tsx`)
- `main.tsx` — loading, error, `AuthBar`, auth redirect
- Internal helpers under `admin/`, `auth/` — called from **action handlers** only, not components or routes
