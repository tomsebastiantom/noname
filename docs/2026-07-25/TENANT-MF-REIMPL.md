# Tenant MF Remotes — Reimplementation Guide

> **Date:** 2026-07-25  
> **Status:** Code **reverted**; docs retained. Use this to rebuild faster.  
> **Companion:** [`TENANT-MF-HANDOFF.md`](./TENANT-MF-HANDOFF.md) (issues/fixes) · [`TENANT-MF-CDN.md`](./TENANT-MF-CDN.md) (architecture)

---

## Before you start

Working implementation existed on 2026-07-25 and was **reverted** on purpose — feature will be simplified and recommitted later. All design + bug fixes are in docs; **do not rediscover from scratch**.

**Read first:** HANDOFF § "Issues hit → fixes" — apply those fixes as you build, not after debugging in browser.

---

## Build order (minimal path to DemoBanner)

Do these in order. Each step should be testable before the next.

### Step 1 — Server bundler (no API yet)

**Files:** `packages/server/src/domains/tenant/adapters/bundler.ts`

- Rspack + `@module-federation/enhanced/rspack` in `mkdtempSync` → `entry.tsx`
- Virtual entry wraps tenant source with `defineCatalog` / `defineRegistry`
- MF plugin: `name: tenant_{orgId}`, `exposes: { "./catalog": entry }`, `dts: false`
- Shared: `react`, `react-dom`, `@json-render/core`, `@json-render/react` with **`import: false`**
- Resolve: `serverRoot/node_modules` + react jsx-runtime aliases
- Output: upload **all** `.js` except remoteEntry; prepend **`__name` polyfill** to remoteEntry
- `publicPath` = asset base URL passed in (critical for chunk loading)
- `packages/server/package.json`: add `react`, `react-dom`, `@json-render/react` deps

**File:** `remote-name.ts` — `tenant_${orgId.replace(/[^a-zA-Z0-9_]/g, "_")}`

### Step 2 — Publish + storage

**Files:**

- `publish-catalog.ts` — `bundleCatalog` → upload all assets to R2 `tenants/{orgId}/` → update manifest
- `asset-urls.ts` — dev: `/api/tenants/{slug}/catalog-assets/`; prod: `/_assets/tenants/{orgId}/` or `ASSET_PUBLIC_BASE_URL`
- `adapters/r2.ts` — add `get(key)` for serving bytes
- `adapters/postgres-manifest-store.ts` — read/write `catalogManifest` via documents storage

**Documents:**

- `documents/ports.ts` — `getCatalogManifest` / `setCatalogManifest`
- `documents/adapters/postgres.ts` — store in `tenant_settings.data.catalogManifest`

### Step 3 — API routes

**File:** `domains/tenant/api.ts`

| Route | Purpose |
|-------|---------|
| `GET /:id/catalog` | Manifest JSON |
| `GET /:id/catalog-assets/:filename` | Serve R2 bytes (dev) |
| `POST /:id/components?sync=1` | Inline source publish (dev) |

Wire in `index.ts` with `resolveBundleStorage` (R2 or local `.catalog-bundles`).

### Step 4 — Client load

**Files:**

- `mf-init.ts` — `registerShared` for react, react-dom, @json-render/*, zod
- `catalog-loader.ts` — private remote: **`shareScope: "default"`** (not tenant name)
- `main.tsx` — already calls `loadCatalogs(manifest)`

### Step 5 — Edge

- `workers/routes/proxy.ts` — public GET for `catalog-assets`
- `workers/routes/static.ts` — `remoteEntry.js` short cache; hashed chunks immutable
- `client/rspack.config.mjs` — proxy `/api` and `/_assets` → `:8787`

### Step 6 — Seed + verify

**Files:**

- `fixtures/demo-catalog-source.ts` — DemoBanner TSX string
- `scripts/seed-tenant-remote.ts` — POST sync publish; patch home layout by **layout document id** (not key `home`)
- `package.json` — `"seed:tenant-remote": "tsx scripts/seed-tenant-remote.ts"`

```bash
pnpm seed:demo && pnpm seed:tenant-remote
open http://yogastore.localhost:5173/
```

### Step 7 — Admin UI (optional for v1)

- `TenantRemoteAdminForm.tsx`, `tenant-remote.ts`, route `/admin/settings/components`
- Defer if simplifying — seed is enough for dev

---

## Critical fixes checklist (copy when implementing)

Apply during implementation — saves hours:

- [ ] MF remote name uses **underscores** not hyphens
- [ ] Virtual entry file is **`.tsx`**
- [ ] Shared deps `import: false` + host `registerShared`
- [ ] Private remote `shareScope: "default"`
- [ ] `__name` polyfill on remoteEntry output
- [ ] Upload **all** JS chunks, set `publicPath` on bundler output
- [ ] Manifest URL includes `?v={version}`
- [ ] Dev asset URL = API proxy (not MinIO direct, not wrangler R2 unless synced)
- [ ] Layout seed uses GET list → PUT by **uuid**
- [ ] Do **not** put zod in MF shared on remote (bundle it) OR register zod on host

---

## Files to create (checklist)

```
packages/server/src/domains/tenant/
  remote-name.ts (+ test)
  asset-urls.ts (+ test)
  publish-catalog.ts
  fixtures/demo-catalog-source.ts
  adapters/postgres-manifest-store.ts
  adapters/local-catalog-storage.ts   # optional, no R2
  adapters/build-status-store.ts      # optional, async builds

scripts/seed-tenant-remote.ts

# Modify existing:
  adapters/bundler.ts
  adapters/r2.ts
  api.ts, service.ts, worker.ts, index.ts, ports.ts
  domains/documents/ports.ts, adapters/postgres.ts

packages/client/
  catalog-loader.ts    # shareScope fix
  mf-init.ts           # zod shared

packages/workers/
  routes/proxy.ts, static.ts
```

---

## Tests to add

- `remote-name.test.ts` — stable `tenant_{orgId}`
- `asset-urls.test.ts` — dev API path vs prod CDN path

Target: 63 tests (58 baseline + 5 tenant URL/name tests).

---

## Simplify when you rebuild (recommended)

Skip or defer on second implementation:

- Admin paste UI → seed script only
- BullMQ async path → sync `?sync=1` until Redis needed
- Local catalog storage → require R2/MinIO in dev
- Marketplace remotes → private only

Keep: bundler, publish, manifest in Postgres, client load, seed, CDN doc path.

---

## After minimal rebuild works

1. [`TENANT-MF-GIT.md`](./TENANT-MF-GIT.md) — Git instead of POST body
2. [`TENANT-MF-SECURITY.md`](./TENANT-MF-SECURITY.md) — validate + allowlist before merchants
3. Update [`TENANT-MF-HANDOFF.md`](./TENANT-MF-HANDOFF.md) — note recommit date + any new simplifications

---

## Doc index

| Doc | Use when |
|-----|----------|
| **REIMPL** (this file) | Starting coding again |
| **HANDOFF** | What broke and how we fixed it |
| **CDN** | R2 paths, caching, prod URLs |
| **GIT** | Production source model (later) |
| **SECURITY** | Before opening to merchants (later) |
