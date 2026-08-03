# Tenant MF Remotes — Implementation Handoff

> **Date:** 2026-07-25  
> **Status:** Code **reverted** (2026-07-25) — working implementation documented here for reimplementation. See [`TENANT-MF-REIMPL.md`](./TENANT-MF-REIMPL.md).  
> **Purpose:** Per-file changelog, bugs hit, fixes applied from the session that proved MF end-to-end.

---

## Scope: now vs later

| Phase | What | Status |
|-------|------|--------|
| **Proven (reverted)** | MF pipeline worked in dev — see HANDOFF | 📋 Code reverted; rebuild via REIMPL |
| **Later** | Git repo → validate → build → publish | 📋 [`TENANT-MF-GIT.md`](./TENANT-MF-GIT.md) |
| **Later** | Import allowlist, validate, publish authz | 📋 [`TENANT-MF-SECURITY.md`](./TENANT-MF-SECURITY.md) |

End goal unchanged — Git + security docs describe **production target**, not work required before merge.

---

## What worked (before revert)

Documented for reimplementation — **not in tree now**:

```bash
pnpm seed:demo
pnpm seed:tenant-remote   # API :3000, edge :8787, R2/MinIO
open http://yogastore.localhost:5173/
```

- Green **DemoBanner** from tenant MF remote
- Manifest in Postgres (`tenant_settings.data.catalogManifest`)
- Bundles in R2 at `tenants/{orgId}/*`
- 63 tests passing (includes `asset-urls`, `remote-name`)

---

## Issues hit → fixes

| # | Symptom | Cause | Fix |
|---|---------|-------|-----|
| 1 | Rspack: invalid MF library name `tenant-383…` | Hyphens in org id | `remote-name.ts` → `tenant_{orgId}`; bundler sanitizes scope |
| 2 | Rspack: JSX parse error in virtual entry | Virtual file was `.ts` | `bundler.ts` → `entry.tsx` + swc tsx |
| 3 | `resolving fallback for shared module zod` | MF shared deps not resolvable from `/tmp` | `import: false` on shared; resolve.modules + react aliases from `packages/server/node_modules` |
| 4 | `ReferenceError: __name is not defined` in remoteEntry | MF enhanced injects `__name` without defining it | Prepend `var __name=function(fn){return fn};` to remoteEntry buffer before R2 upload |
| 5 | Browser loads stale remoteEntry after republish | `Cache-Control: immutable` + fixed filename | Manifest URL `?v={version}`; bump version each publish |
| 6 | `Loading chunk 745.catalog.*.js failed` | Only one chunk uploaded; wrong publicPath | Upload **all** `.js` files; `publicPath` = asset base URL |
| 7 | Seed failed `PUT /layout/home` | Layout API expects document **UUID**, not key `home` | `seed-tenant-remote.ts` → lookup layout id via GET list, then PUT by id |
| 8 | `#RUNTIME-012` shared `zod` / `@json-render/core` | Tenant remote used `shareScope: name` — host shared deps on `default` | `catalog-loader.ts` → `shareScope: "default"` for private remote |
| 9 | `#RUNTIME-012` after zod removed from bundler shared | Same scope issue for core | Same shareScope fix + removed zod from remote shared (bundled in remote) |
| 10 | Manifest URL `localhost:9000/noname-assets/…` — UI blank | Cross-origin MinIO; `ASSET_PUBLIC_BASE_URL` in `.env` | **Dev:** `asset-urls.ts` uses `/api/tenants/{slug}/catalog-assets/` when `NODE_ENV !== production` |
| 11 | `/_assets/tenants/…` 404 in dev | API writes MinIO; wrangler R2 binding is separate bucket | Dev uses API proxy path (above), not edge `/_assets/` |
| 12 | HTTP 500 on storefront | API process killed / multiple listeners on :3000 | Restart single API; edge + client up |

---

## File-by-file changes

### Server — tenant domain (new / rewritten)

| File | Change |
|------|--------|
| `domains/tenant/adapters/bundler.ts` | Rspack+MF in temp dir; `entry.tsx`; shared `import:false`; resolve aliases; `__name` polyfill; multi-chunk output; `assetPublicPath` |
| `domains/tenant/publish-catalog.ts` | **New** — bundle → R2 upload all assets → manifest version + URL |
| `domains/tenant/asset-urls.ts` | **New** — dev API proxy vs prod CDN URL base |
| `domains/tenant/asset-urls.test.ts` | **New** — 4 tests for URL resolution |
| `domains/tenant/remote-name.ts` | **New** — `tenant_{orgId}` MF name |
| `domains/tenant/remote-name.test.ts` | **New** |
| `domains/tenant/adapters/postgres-manifest-store.ts` | **New** — manifest via `DocumentStorage.get/setCatalogManifest` |
| `domains/tenant/adapters/local-catalog-storage.ts` | **New** — `.catalog-bundles/` when no R2 |
| `domains/tenant/adapters/build-status-store.ts` | **New** — in-memory build status |
| `domains/tenant/adapters/r2.ts` | Added `get()` for catalog-assets route |
| `domains/tenant/adapters/manifest-store.ts` | Wired to postgres store |
| `domains/tenant/fixtures/demo-catalog-source.ts` | **New** — DemoBanner TSX for seed |
| `domains/tenant/api.ts` | `GET catalog`, `GET catalog-assets/:file`, `POST components`, build status |
| `domains/tenant/service.ts` | Sync publish + BullMQ enqueue |
| `domains/tenant/worker.ts` | Uses `publishTenantCatalog` |
| `domains/tenant/index.ts` | Wires postgres manifest, R2/local storage, routes |
| `domains/tenant/ports.ts` | `CatalogManifest`, build result types |
| `packages/server/package.json` | Added `react`, `react-dom`, `@json-render/react` for bundler resolve |

### Server — documents (manifest persistence)

| File | Change |
|------|--------|
| `domains/documents/ports.ts` | `getCatalogManifest` / `setCatalogManifest` on storage |
| `domains/documents/adapters/postgres.ts` | Persist `catalogManifest` in `tenant_settings.data` |
| `domains/documents/*test*` | Mock new manifest methods |

### Client

| File | Change |
|------|--------|
| `catalog-loader.ts` | Private remote `shareScope: "default"` |
| `mf-init.ts` | Register shared `zod` |
| `auth/tenant-remote.ts` | **New** — fetch manifest, publish API |
| `core/components/TenantRemoteAdminForm.tsx` | **New** — paste TSX admin (dev) |
| `core/catalog-schemas.ts` | Schema for admin form |
| `core/components.tsx` | Export form component |
| `core/components/AdminShell.tsx` | Nav link |
| `platform-routes.ts` | `/admin/settings/components` → `admin_tenant_remote` |
| `rspack.config.mjs` | Proxy `/_assets` → edge :8787 |

### Workers / edge

| File | Change |
|------|--------|
| `routes/proxy.ts` | Public GET for `catalog-assets` |
| `routes/static.ts` | Different cache for `remoteEntry.js` vs hashed chunks |

### Scripts / root

| File | Change |
|------|--------|
| `scripts/seed-tenant-remote.ts` | **New** — sync publish + patch home layout |
| `scripts/seed/demo.ts` | `admin_tenant_remote` layout + nav |
| `package.json` | `seed:tenant-remote` script |

### Docs (new)

| File | Purpose |
|------|---------|
| `TENANT-MF-CDN.md` | Shipped: build → R2 → CDN/API |
| `TENANT-MF-GIT.md` | **Later:** Git repo pipeline |
| `TENANT-MF-SECURITY.md` | **Later:** trust model + allowlist |
| `TENANT-MF-HANDOFF.md` | This file |

### Docs (updated)

`DYNAMIC_CATALOG_BUILD.md`, `MODULE_FEDERATION.md`, `ARCHITECTURE-MAP.md`, `PLATFORM-STATUS.md`, `ROADMAP-PHASES.md`, `CLIENT-CATALOG-LAYERS.md`

---

## Architecture (shipped)

```
POST /components { source }  →  bundler  →  R2 tenants/{orgId}/*
                           →  Postgres catalogManifest
GET /catalog               →  manifest JSON
GET /catalog-assets/*      →  R2 bytes (dev proxy)
Client loadCatalogs        →  registerRemotes → loadRemote → merge registry
```

Production CDN path: `/_assets/tenants/{orgId}/` or `ASSET_PUBLIC_BASE_URL` (see `asset-urls.ts`).

---

## Validate before commit

```bash
pnpm test                    # 63 tests
pnpm seed:demo
pnpm seed:tenant-remote
# API :3000, edge :8787, client :5173
curl -s http://localhost:8787/api/tenants/yogastore/catalog -H 'Host: yogastore.localhost' | jq .data.private.url
# Expect /api/tenants/yogastore/catalog-assets/remoteEntry.js?v=N in dev
```

Browser: http://yogastore.localhost:5173/ — DemoBanner visible, no MF runtime error in console.

---

## When you come back (later phases)

1. Read [`TENANT-MF-GIT.md`](./TENANT-MF-GIT.md) — replace POST `{ source }` with git clone adapter; keep `bundler.ts` + `publish-catalog.ts`.
2. Read [`TENANT-MF-SECURITY.md`](./TENANT-MF-SECURITY.md) — validate + import allowlist before merchant self-serve.
3. Remove or gate admin paste UI behind dev flag when Git ships.

No change to end-state design — only sequencing.
