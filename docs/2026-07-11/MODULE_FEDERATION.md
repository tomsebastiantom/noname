# Module Federation — Architecture & Build Plan

## Why MF From Day 1

The three-layer component catalog (platform → marketplace → tenant private) creates a dependency versioning problem the moment a second catalog exists outside the platform build. Without per-catalog dependency isolation, a marketplace package built against `@json-render/core` 0.17 breaks when the platform runs 0.19.

Module Federation v2 solves this with **share scopes** — each catalog resolves dependencies in its own sandbox, even when multiple versions of the same library are loaded simultaneously.

Decision: Start with MF. The build pipeline is the same complexity as native `import()`, only the Rspack config differs (~20 lines). Migrating later costs more.

---

## Architecture

### Dependency Isolation Model

```
Browser Memory
├── Share Scope: "platform" (host app)
│   ├── react: 19.x
│   ├── react-dom: 19.x
│   ├── @json-render/core: 0.19
│   └── @json-render/react: 0.19
│
├── Share Scope: "yogastore" (tenant private)
│   ├── react: 19.x          ← resolved from host (same version)
│   ├── react-dom: 19.x      ← resolved from host
│   ├── @json-render/core: 0.19  ← resolved from host
│   └── @json-render/react: 0.19 ← resolved from host
│
└── Share Scope: "marketplace" (third-party packages)
    ├── react: 19.x          ← resolved from host
    ├── react-dom: 19.x      ← resolved from host
    ├── @json-render/core: 0.17  ← DIFFERENT, isolated in this scope
    └── @json-render/react: 0.17 ← DIFFERENT, isolated in this scope
```

Scope assignment rule:
- `platform` — host app's own scope (built into client bundle)
- `{tenantId}` — per-tenant private catalogs (one scope per tenant)
- `marketplace` — all marketplace packages share one scope (all third-party, same isolation need)

---

## What Needs To Be Built

### 1. packages/client — MF Runtime Host

**New dependency:**
```
"@module-federation/runtime": "^0.x"
```

**New file: `src/mf-init.ts`**
Initializes the MF runtime when the host app loads. Declares which dependencies are shared and how they resolve.

**Modified file: `src/catalog-loader.ts`**
Replaces `import(url)` with `loadRemote(name + "/catalog")` for tenant/marketplace catalogs. Platform catalog stays as a bundled static import.

**Flow:**
```
1. App mounts → mf-init.ts runs (once)
2. Fetch catalog manifest from worker
3. For platform: already bundled, skip
4. For marketplace packages: registerRemote(name, { entry: url, shareScope: "marketplace" })
5. For tenant private: registerRemote(name, { entry: url, shareScope: tenantId })
6. loadRemote(...) for each → get { registry, handlers, executeAction }
7. Merge registries (last wins)
8. Render with merged registry
```

**What doesn't change:**
- `catalog.ts` (platform catalog definition)
- `registry.ts` (platform registry)
- `components/index.tsx` (component implementations)
- `main.tsx` (just calls mf-init before catalog-loader)

### 2. packages/server — Tenant Catalog Build Service

**New dependencies:**
```
"@rspack/core": "^1.x",
"@module-federation/enhanced/rspack": "^0.x"
```

**New file: `src/services/catalog-bundler.ts`**
Accepts tenant JSX source, runs Rspack in-memory build with ModuleFederationPlugin, returns two output files.

**Rspack config per tenant build:**
```js
{
  entry: "./virtual-entry.ts",       // generated from tenant JSX
  output: { filename: "catalog.js" },
  plugins: [
    new ModuleFederationPlugin({
      name: "tenant-yogastore",       // scoped name
      filename: "remoteEntry.js",
      exposes: {
        "./catalog": "./virtual-entry.ts"
      },
      shared: {
        react: { singleton: true },
        "react-dom": { singleton: true },
        "@json-render/core": { singleton: true },
        "@json-render/react": { singleton: true },
      }
    })
  ]
}
```

**Virtual entry generation:**
The tenant uploads JSX source. The bundler wraps it into a valid entry point:
```ts
// Generated virtual-entry.ts
import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { defineRegistry } from "@json-render/react";
import { z } from "zod";

// --- BEGIN TENANT CODE ---
// ... user's catalog definition ...
// --- END TENANT CODE ---

export const catalog = defineCatalog(schema, { ... });
export const { registry } = defineRegistry(catalog, { ... });
```

**Build output:** Two files per build:
```
R2: /tenants/yogastore/remoteEntry.js    (~5 KB)
R2: /tenants/yogastore/catalog.js         (~20-50 KB, varies by component count)
```

### 3. packages/server — API Endpoints

**New route: `POST /api/tenants/:id/components`**

Accepts:
```json
{
  "name": "YTClassSchedule",
  "source": "... JSX/TSX source ..."
}
```

Flow:
1. Validate tenant ownership
2. Validate JSX (syntax check, no forbidden imports)
3. Generate virtual entry + Rspack config
4. Run in-memory Rspack build
5. Upload `remoteEntry.js` and `catalog.js` to R2
6. Update tenant catalog manifest in Postgres
7. Purge Worker KV for this tenant's catalog manifest
8. Return `{ name, url, hash }`

**New route: `DELETE /api/tenants/:id/components/:name`**

Flow:
1. Remove component from manifest
2. Delete R2 files
3. Purge KV cache

### 4. packages/server — Catalog Manifest Storage

**New DB table or field:**
```sql
ALTER TABLE tenants ADD COLUMN catalog_manifest JSONB DEFAULT '{}';

-- Example value:
{
  "private": {
    "hash": "abc123",
    "components": ["YTClassSchedule", "YTInstructorCard"],
    "version": 5
  },
  "marketplace": [
    { "name": "stripe-pricing", "hash": "def456", "version": 1 }
  ]
}
```

### 5. New API endpoint: `GET /api/tenants/:id/catalog`

Returns the merged manifest for this tenant:
```json
{
  "platform": { "version": "2", "hash": "platform-abc" },
  "private": {
    "url": "https://r2.noname.dev/tenants/yogastore/remoteEntry.js",
    "hash": "abc123",
    "version": 5
  },
  "marketplace": [
    {
      "name": "stripe-pricing",
      "url": "https://r2.noname.dev/marketplace/stripe-pricing/remoteEntry.js",
      "hash": "def456",
      "version": 1
    }
  ]
}
```

This endpoint is called by the edge worker (or directly by the client during dev) to discover what catalogs to load.

---

## Build & Deploy Pipeline

### Platform build (unchanged)

```
packages/client/
  pnpm build → rspack build → dist/
    ├── index.html
    ├── assets/platform.js       (host app, includes MF runtime + platform catalog)
    └── assets/vendor-react.js   (React chunks, code-split)
  
  Upload dist/ → R2 /_assets/platform-v{N}/
```

### Tenant build (new)

```
POST /api/tenants/:id/components
  │
  ▼
catalog-bundler.ts
  │  1. Generate virtual-entry.ts from tenant JSX
  │  2. Create in-memory Rspack compiler with MF plugin
  │  3. Run build → { remoteEntry.js, catalog.js }
  │
  ▼
Upload to R2
  │  tenants/{id}/remoteEntry.js
  │  tenants/{id}/catalog.js
  │
  ▼
Update Postgres
  │  tenants.catalog_manifest → new hash + version
  │
  ▼
Purge KV
  │  Delete key: catalog-manifest:{tenantId}
  │  Next request rebuilds from Postgres
  │
  ▼
201 Created
```

### Marketplace build (same pipeline, different target)

```
POST /api/marketplace/packages
  │  Same bundler, same Rspack config
  │  Different R2 path: marketplace/{pkg-name}/
  │  Different Postgres table: marketplace_packages
  ▼
Available for tenant install
```

---

## File Manifest — What Changes Where

### packages/client

| File | Action | Purpose |
|------|--------|---------|
| `package.json` | Add dep | `@module-federation/runtime` |
| `src/mf-init.ts` | **NEW** | Initialize MF runtime with shared scope config |
| `src/catalog-loader.ts` | **NEW** | Dynamic remote loading: `registerRemote` + `loadRemote` |
| `src/main.tsx` | Modify | Call `mf-init` before catalog loading |
| `src/catalog.ts` | No change | Platform base catalog |
| `src/registry.ts` | No change | Platform registry |
| `src/components/` | No change | Component implementations |

### packages/server

| File | Action | Purpose |
|------|--------|---------|
| `package.json` | Add deps | `@rspack/core`, `@module-federation/enhanced` |
| `src/services/catalog-bundler.ts` | **NEW** | In-memory Rspack + MF build for tenant JSX |
| `src/domains/tenant/` | **NEW** | Tenant domain (or add to existing documents domain) |
| `src/domains/tenant/api.ts` | **NEW** | POST/DELETE tenant components, GET catalog manifest |
| R2 client config | Modify | Add `tenants/` prefix handling |

### packages/workers

| File | Action | Purpose |
|------|--------|---------|
| `wrangler.toml` | Verify | R2 binding already configured |
| `src/routes/static.ts` | No change | Already serves `/_assets/*` from R2 |
| `src/routes/api.ts` | No change | Already proxies to server |

### Database

| Table | Action | Purpose |
|-------|--------|---------|
| `tenants` | New column | `catalog_manifest JSONB` |
| `marketplace_packages` | **NEW** | Published marketplace catalog metadata |

---

## Timeline & Phasing

### Phase 1: MF foundation (this sprint)

1. Add `@module-federation/runtime` to client
2. Create `mf-init.ts` and `catalog-loader.ts` in client
3. Build the bundler service in server (`catalog-bundler.ts`)
4. Create `GET /api/tenants/:id/catalog` endpoint
5. End-to-end test: platform catalog loads via MF (no tenant catalogs yet)

### Phase 2: Tenant private catalogs

1. `POST /api/tenants/:id/components` endpoint
2. Virtual entry generation + Rspack build
3. R2 upload + manifest update + KV purge
4. Client loads tenant catalog dynamically

### Phase 3: Marketplace

1. `marketplace_packages` table + API
2. Tenant install/uninstall flow
3. Marketplace share scope isolation
