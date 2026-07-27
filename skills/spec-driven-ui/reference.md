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
| Merchant copy on storefront | `content` document | `$state` + resolve |
| Provider toggles | `tenant_settings.auth` | Client merge |
| Locale | `tenant_settings.locales` + layout props | Per-store language without TSX changes |

**Rule:** If the user can read it on screen, it is **not** a string literal in `.tsx` (except loading/error fallbacks in `main.tsx` host shell).

---

## Files to touch (quick map)

| Change | Files |
|--------|-------|
| Platform component | `core/catalog-schemas.ts`, `core/components*.tsx`, `platform/registry.ts` |
| Platform action | `core/actions/*.ts`, `platform/registry.ts`, server domain |
| Admin layout | `scripts/seed-demo.ts`, optional `main.tsx` |
| Extension widget | `packages/extensions/src/{name}/` (4 files + index loader) |
| Public auth config | `packages/workers/src/routes/proxy.ts` if new public GET |

---

## Anti-patterns

| Wrong | Right |
|-------|-------|
| `pages/AdminProducts.tsx` | `ContentEntryAdmin` + content type |
| react-router merchant routes | `templateFromPath` + layout doc |
| `fetch("/api/…")` in button | `executeAction` |
| Per-org config in `.env` | `tenant_settings` or layout |
| Separate admin SPA package | Same `packages/client` Renderer |
| `"Save & publish"` in component TSX | `publishLabel` (and peers) in layout spec props |
| English-only strings in React | Props from layout JSON; locale via `tenant_settings.locales` |

---

## Exceptions (allowed outside Renderer)

- `/auth/callback` — OAuth handler (`auth/callback-page.tsx`)
- `main.tsx` — loading, error, `AuthBar`, auth redirect
- Internal helpers under `admin/`, `auth/` — called from catalog components/actions, not routes
