# Dynamic Catalog Loading — Design & Implementation

## Status: Phase 1 Foundation Complete (2026-07-11)

---

## The Goal

Let tenants add custom React components to their storefront without rebuilding the platform. A tenant uploads JSX, the server builds it into a Module Federation remote, the client loads it at runtime. Three catalog layers resolve last-wins: tenant private > marketplace > platform base.

---

## Architecture

```
                    ┌──────────────────────────────────┐
                    │         packages/client           │
                    │                                   │
                    │  mf-init.ts                       │
                    │    → init() MF runtime            │
                    │    → registerShared(react, ...)   │
                    │                                   │
                    │  catalog-loader.ts                │
                    │    → fetch manifest               │
                    │    → registerRemotes(...)          │
                    │    → loadRemote("tenant/catalog")  │
                    │    → merge registries              │
                    │                                   │
                    │  main.tsx                         │
                    │    → loadCatalogs(manifest)        │
                    │    → <Renderer registry={merged}>  │
                    └──────────────┬───────────────────┘
                                   │
        ┌──────────────────────────┼───────────────────────────┐
        │                          ▼                           │
        │  ┌──────────────────────────────────────────────────┐│
        │  │       packages/server — tenant domain             ││
        │  │                                                   ││
        │  │  api.ts                                           ││
        │  │    → GET  /api/tenants/:id/catalog                 ││
        │  │    → POST /api/tenants/:id/components  → 202      ││
        │  │    → GET  /api/tenants/:id/builds/:buildId        ││
        │  │    → DELETE /:id/components/:name                 ││
        │  │                                                   ││
        │  │  service.ts                                       ││
        │  │    → enqueue build (BullMQ) — never blocks        ││
        │  │    → getManifest / getBuildStatus                 ││
        │  │                                                   ││
        │  │  queue.ts                                         ││
        │  │    → BullMQ queue "catalog-builds"                ││
        │  │    → deduplicates via content-addressable hash    ││
        │  │                                                   ││
        │  │  worker.ts (separate execution thread)            ││
        │  │    → picks up job from queue                      ││
        │  │    → adapters/bundler.ts → Rspack + MF build      ││
        │  │    → adapters/r2.ts → upload to Cloudflare R2     ││
        │  │    → adapters/manifest-store.ts → update manifest ││
        │  └──────────────────────────────────────────────────┘│
        │                                                       │
        │  ┌──────────────────────────────────────────────────┐│
        │  │         packages/workers (edge CDN)              ││
        │  │    → GET /_assets/* from R2 (tenant + platform)  ││
        │  └──────────────────────────────────────────────────┘│
        └──────────────────────────────────────────────────────┘
```

---

## Decision: Why BullMQ (Async Build Queue)

**Problem:** Rspack builds take 1-3 seconds. Running that synchronously inside the HTTP handler blocks the Node.js event loop. Concurrent builds could exhaust memory (Rspack is Rust-compiled but the JS host process still pays allocation cost).

**Solution:** Follow the same pattern as the agent domain. `POST /components` enqueues a BullMQ job and returns `202 Accepted` with a `buildId`. The worker processes the build in a separate execution context. The client polls `GET /builds/:buildId` for completion.

**Why not a separate service?** The project already has BullMQ + Redis. Adding one more queue ("catalog-builds") is zero-infra-cost. Same Redis connection, same pattern, same OTel tracing propagation.

**Async flow:**
```
POST /api/tenants/yogastore/components
  → service.enqueue() → BullMQ add → return 202 { buildId: "uuid", status: "pending" }

BullMQ Worker (concurrency: 2, max retries: 3, exponential backoff 5s)
  → picks up job
  → bundler.bundleCatalog({ scope, source })
  → upload remoteEntry.js + catalog.js to R2
  → update manifest store
  → set build status: completed

Browser polls:
  GET /api/tenants/yogastore/builds/{buildId}
  → { status: "running" | "completed" | "failed", result: { ... } }
```

---

## R2 Storage Path Convention

All tenant catalog bundles live under a per-tenant prefix keyed by **org id** (not store slug):

```
R2 bucket: noname-assets
  tenants/
    383371762538184712/
      remoteEntry.js              # MF container bootstrap
      745.catalog.a3f2b8c1.js     # Hashed catalog chunk(s)
    {other-org-id}/
      remoteEntry.js
      catalog.d9e4f7a2.js

  marketplace/                    # Future: Phase 3
    stripe-pricing/
      remoteEntry.js

  _assets/                        # Platform client bundle (built separately)
    platform-v2/
      index.html
      assets/index.js
```

**CDN URLs** (served by edge worker `/_assets/*` → R2 key without prefix):

```
/_assets/tenants/{orgId}/remoteEntry.js?v={version}
/_assets/tenants/{orgId}/745.catalog.{hash}.js
```

Manifest stores the versioned remoteEntry URL; chunks use content hashes in filenames. See [`TENANT-MF-CDN.md`](../2026-07-25/TENANT-MF-CDN.md).

The `remoteEntry.js` filename is **stable** (no hash) — this is the URL the manifest points to. The `catalog.[contenthash:8].js` filename includes a content hash from Rspack, enabling long-term browser caching. When a tenant republishes a component, only `remoteEntry.js` changes (its `__federation__` container references the new catalog chunk hash). Old catalog chunks remain in R2 for cached visitors.

---

## Content-Addressable Hashing (esm.sh Pattern)

We hash the build inputs to **prevent duplicate work**. If a tenant uploads the same source code twice, the bundler detects the collision and returns the existing result.

```typescript
// adapters/bundler.ts
function computeHash(input: BundleInput): string {
  const hash = createHash("sha256");
  hash.update(input.scope);       // "tenant-yogastore-YTClassSchedule"
  hash.update(input.source);      // full JSX source code
  return hash.digest("hex").slice(0, 16);
}
```

**Where the "cache" lives:**

| Layer | What | Duration |
|-------|------|----------|
| **In-memory** | `pendingBuilds` Map — same hash → same Promise (deduplicates concurrent requests) | Request lifetime |
| **R2 (content)** | `catalog.[hash].js` — filename changes only when source changes | Indefinite (immutable) |
| **R2 (container)** | `remoteEntry.js` — overwritten on every publish | Overwritten |
| **BullMQ** | Job deduplication via `buildId` UUID | Per build |

There is no separate build cache directory. If a tenant publishes the exact same source: `computeHash` returns the same key, the `pendingBuilds` Map short-circuits (if still in flight), and the BullMQ `buildId` is different (a new UUID) so the job runs fresh. For true caching (skip the build entirely), we'd add a `buildResults` Map in `bundler.ts` keyed by hash — this is a Phase 2 optimization.

---

## Tenant source input (production)

Today builds accept inline TSX via `POST /components { source }` (dev/seed). **Production:** tenant TSX lives in **their Git repo**; Noname clones on webhook, validates, then runs the same bundler → R2 → manifest path.

Full design: [`TENANT-MF-GIT.md`](../2026-07-25/TENANT-MF-GIT.md)

---

## Platform Catalog Versioning

The platform base catalog (7 components shipped in `packages/client`) has its own version and hash, exposed in the manifest:

```json
{
  "platform": { "version": "1", "hash": "init" }
}
```

This is the **static** reference. Every time we publish a new client bundle with updated platform components, we bump `version` and update `hash` to the content hash of the built bundle. The manifest returns this so:
- The client can validate it has the latest platform catalog (compare hash)
- The edge worker can purge KV cache when platform version changes
- Marketplace packages can declare a minimum platform version

Currently hardcoded (`version: "1", hash: "init"`). When we add a CI build pipeline, these will be injected at build time.

---

## Files Created

### packages/client

| File | Purpose |
|------|---------|
| `src/mf-init.ts` | Initialize MF runtime, declare shared deps (react, react-dom, json-render) |
| `src/catalog-loader.ts` | Fetch manifest → registerRemotes → loadRemote → merge registries |
| `src/main.tsx` | Updated: calls loadCatalogs, renders with merged registry |

### packages/server — tenant domain

| File | Purpose |
|------|---------|
| `domains/tenant/index.ts` | `createTenantDomain()` — wires service, routes, worker |
| `domains/tenant/ports.ts` | `TenantCatalogService` + `BuildStatus` types |
| `domains/tenant/service.ts` | Enqueues BullMQ jobs (async), getManifest, getBuildStatus |
| `domains/tenant/api.ts` | 4 routes: GET catalog, POST components (202), GET build status, DELETE |
| `domains/tenant/queue.ts` | BullMQ queue "catalog-builds" |
| `domains/tenant/worker.ts` | Async worker: bundler → R2 upload → manifest update |
| `domains/tenant/adapters/bundler.ts` | Rspack + MF in-memory build, content-addressable hashing |
| `domains/tenant/adapters/r2.ts` | S3-compatible client for Cloudflare R2 |
| `domains/tenant/adapters/manifest-store.ts` | In-memory Map (manifest + build statuses) |

### packages/workers

Serves tenant MF bundles via `GET /_assets/tenants/{orgId}/*` → R2. API `catalog-assets` route remains for local dev without R2.

Detail: [`TENANT-MF-CDN.md`](../2026-07-25/TENANT-MF-CDN.md)

---

## New Dependencies

### packages/client
```
@module-federation/runtime@^2.7.0
```

### packages/server
```
@rspack/core@^2.1.0
@module-federation/enhanced@^2.7.0
```

---

## API Routes

| Method | Path | Response | Purpose |
|--------|------|----------|---------|
| `GET` | `/api/tenants/:id/catalog` | `200 { data: CatalogManifest }` | Returns merged manifest (platform + private) |
| `POST` | `/api/tenants/:id/components` | `202 { data: { buildId, status } }` | Enqueues build job |
| `GET` | `/api/tenants/:id/builds/:buildId` | `200 { data: BuildStatus }` | Polls build progress |
| `DELETE` | `/api/tenants/:id/components/:name` | `204` | Removes component from manifest |

---

## Typecheck & Build

```
packages/client: tsc --noEmit → ✅  rspack build → ✅ (412 KB / 124 KB gzipped)
packages/server: tsc --noEmit → ✅
```

---

## Still To Do

### Phase 2 — Postgres persistence
- Replace in-memory `manifest-store.ts` with Postgres adapter
- Add `tenant_catalogs` table (tenantId, manifest JSONB, updatedAt)

### Phase 3 — Marketplace
- `marketplace_packages` table
- Install/uninstall flow
- Marketplace share scope isolation in MF runtime

### Phase 4 — Edge caching & build cache
- Worker KV cache for catalog manifests (purge on publish)
- `buildResults` Map in bundler.ts for true build result caching
- Inject platform version/hash from CI at build time
