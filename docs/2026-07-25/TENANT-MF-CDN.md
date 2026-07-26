# Tenant MF Remotes — CDN Delivery

> **Date:** 2026-07-25  
> **Status:** Design + proven approach documented; **code reverted** — implement via [`TENANT-MF-REIMPL.md`](./TENANT-MF-REIMPL.md)  
> **Related:** [`TENANT-MF-GIT.md`](./TENANT-MF-GIT.md) · [`MODULE_FEDERATION.md`](../2026-07-11/MODULE_FEDERATION.md) · [`DYNAMIC_CATALOG_BUILD.md`](../2026-07-11/DYNAMIC_CATALOG_BUILD.md) · [`CLIENT-CATALOG-LAYERS.md`](./CLIENT-CATALOG-LAYERS.md)

---

## One-line summary

Tenant custom components are **built on the API**, stored in **R2**, served from the **edge CDN** (`/_assets/…`), and discovered via a small **manifest API**. The browser never loads JS bytes through the API in production.

---

## Why split manifest vs assets?

| Concern | Served by | Example |
|---------|-----------|---------|
| **What to load** (metadata) | API / Postgres | `GET /api/tenants/yogastore/catalog` |
| **JS bytes** (remoteEntry + chunks) | Edge CDN → R2 | `GET /_assets/tenants/{orgId}/remoteEntry.js?v=12` |

This matches how the **platform client bundle** already works (`/_assets/*` → R2) and how most Module Federation platforms operate: a registry/manifest API plus static assets on a CDN.

---

## End-to-end flow

```
Merchant/admin                API                         R2                    Edge CDN              Browser
─────────────                ───                         ──                    ────────              ───────
POST /components  ──►  Rspack build (in /tmp)
  { source: TSX }        upload all .js files  ──►  tenants/{orgId}/*
                         update manifest in Postgres
                                                    GET /_assets/tenants/{orgId}/*  ◄──  MF runtime
GET /catalog ◄── manifest { private.url } ───────────────────────────────────────────────  fetch manifest
```

### Publish (server)

1. `POST /api/tenants/:slug/components` (sync `?sync=1` for dev, async BullMQ when Redis up)
2. `bundler.ts` — Rspack + Module Federation in OS temp dir
3. Upload to R2:
   ```
   tenants/{orgId}/remoteEntry.js
   tenants/{orgId}/745.catalog.{contenthash}.js
   ```
4. Save manifest in `tenant_settings.data.catalogManifest`:
   ```json
   {
     "private": {
       "name": "tenant_383371762538184712",
       "url": "/_assets/tenants/383371762538184712/remoteEntry.js?v=12",
       "hash": "9305c6edc8c365b9",
       "version": 12
     }
   }
   ```

### Load (client)

1. `main.tsx` → `GET /api/tenants/{slug}/catalog`
2. `catalog-loader.ts` → `registerRemotes({ entry: manifest.private.url })`
3. `loadRemote("tenant_{orgId}/catalog")` → fetches remoteEntry from CDN
4. remoteEntry loads hashed chunks from same `publicPath` prefix
5. Merge `registry` with platform + extensions → `Renderer`

---

## URL conventions

| Piece | Value | Notes |
|-------|-------|-------|
| **R2 storage key** | `tenants/{orgId}/{filename}` | Stable org id, not slug |
| **CDN path** | `/_assets/tenants/{orgId}/{filename}` | Worker strips `/_assets/` → R2 key |
| **Manifest URL** | CDN path + `?v={version}` | Busts cache for stable `remoteEntry.js` name |
| **MF remote name** | `tenant_{orgId}` | Underscores only (hyphens invalid) |
| **Rspack publicPath** | Same as CDN base | Chunk URLs inside remoteEntry resolve correctly |

Production can set `ASSET_PUBLIC_BASE_URL=https://assets.noname.dev` so manifest URLs are absolute (custom domains, separate asset hostname).

---

## Dev vs prod delivery

| Mode | When | Asset base URL |
|------|------|----------------|
| **CDN** | R2 env configured (default dev with MinIO) | `/_assets/tenants/{orgId}/` |
| **CDN (absolute)** | R2 + `ASSET_PUBLIC_BASE_URL` | `https://assets.noname.dev/tenants/{orgId}/` |
| **API fallback** | No R2 — local `.catalog-bundles/` | `/api/tenants/{slug}/catalog-assets/` |

Client dev server proxies both `/api` and `/_assets` to the edge worker (`:8787`).

Helper: `packages/server/src/domains/tenant/asset-urls.ts`

---

## Caching

| Asset | Cache-Control | Why |
|-------|---------------|-----|
| Hashed chunks (`*.catalog.*.js`) | `immutable, max-age=31536000` | Content-addressed — safe forever |
| `remoteEntry.js` | `max-age=60, must-revalidate` | Stable filename; manifest uses `?v=` for bust |
| Manifest JSON | Short TTL / no cache | Changes on every publish |

---

## Build dedup (not CDN cache)

| Layer | Key | Purpose |
|-------|-----|---------|
| In-flight | `scope + source hash` | Dedup concurrent identical builds |
| Content hash | `sha256(scope + source)` | Stored in manifest; future skip-build optimization |
| R2 objects | Content-hashed chunk filenames | Old chunks kept for visitors with stale remoteEntry |

There is **no Rspack disk cache** today — each publish runs a fresh compile unless dedup catches an in-flight request.

---

## Admin + seed (dev shortcut)

| Route / script | Purpose |
|----------------|---------|
| `/admin/settings/components` | `TenantRemoteAdminForm` — paste TSX + publish (dev only) |
| `pnpm seed:tenant-remote` | Demo `DemoBanner` + home layout patch |

**Production model:** tenant TSX in **their Git repo** → webhook → validate → build → CDN. See [`TENANT-MF-GIT.md`](./TENANT-MF-GIT.md). Do not rely on copy-paste long term.

Requires API up + demo org seeded (`pnpm seed:demo`).

---

## Files

| File | Role |
|------|------|
| `packages/server/src/domains/tenant/adapters/bundler.ts` | Rspack + MF build |
| `packages/server/src/domains/tenant/publish-catalog.ts` | Upload + manifest |
| `packages/server/src/domains/tenant/asset-urls.ts` | CDN vs API URL resolution |
| `packages/server/src/domains/tenant/api.ts` | Catalog + catalog-assets (fallback) |
| `packages/workers/src/routes/static.ts` | `/_assets/*` → R2 |
| `packages/client/src/catalog-loader.ts` | MF remote load + registry merge |
| `packages/client/src/mf-init.ts` | Shared deps for host |

---

## Validate locally

```bash
pnpm seed:demo
pnpm seed:tenant-remote   # API :3000, R2/MinIO, edge :8787
open http://yogastore.localhost:5173/
```

Expect green **DemoBanner** from tenant MF remote. In Network tab:

- Manifest: `/api/tenants/yogastore/catalog`
- Remote: `/_assets/tenants/{orgId}/remoteEntry.js?v=N` (not `/api/.../catalog-assets/` when R2 configured)

---

## Future (Phase D+)

- **Git repo source** — GitHub App, clone on push, validate → build → publish ([`TENANT-MF-GIT.md`](./TENANT-MF-GIT.md))
- Skip Rspack when content hash already in R2
- Signed CDN URLs for private tenant bundles
- Marketplace remotes at `/_assets/marketplace/{pkg}/`
- KV purge hook when manifest version bumps
