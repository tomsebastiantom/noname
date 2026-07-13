# Multi-Tenant Component Catalog — Scalable Architecture

## The Problem

Right now `packages/client` has a single hardcoded catalog — all tenants get the same 7 components. This doesn't scale. Real tenants need:

1. **Platform catalog** — Common components the platform provides to everyone (Hero, Grid, Button, etc.)
2. **Public marketplace** — Components built by one tenant, shared with others (like Shopify app store)
3. **Private custom** — Components built by a tenant, visible only to that tenant

And these catalogs change at runtime — a tenant publishes a new component, it should be available immediately without rebuilding the platform client bundle.

---

## Design

### Catalog Layers (Resolution Order)

```
Request for tenant "yogastore" at path "/products/yoga-mat"
         │
         ▼
  ┌──────────────────────────────────────────┐
  │  LAYER 1: Platform Base Catalog           │
  │  --------------------------------------  │
  │  Components: Hero, Grid, Stack, Text,     │
  │  Button, Image, ProductCard, Input,       │
  │  Form, Carousel, Tabs, Modal, Toast       │
  │                                           │
  │  → Built into client bundle               │
  │  → Loaded once, cached forever            │
  │  → ~20-30 components                      │
  └──────────────────────────────────────────┘
         │
         ▼
  ┌──────────────────────────────────────────┐
  │  LAYER 2: Tenant Private Catalog          │
  │  --------------------------------------  │
  │  Components unique to "yogastore":        │
  │  YTClassSchedule, YTInstructorCard,       │
  │  YTBookingTimeline                        │
  │                                           │
  │  → Stored as JSON specs in Postgres       │
  │  → Dynamically loaded at runtime          │
  │  → Registered into catalog on demand      │
  │  → Cached in Worker KV per tenant         │
  └──────────────────────────────────────────┘
         │
         ▼
  ┌──────────────────────────────────────────┐
  │  LAYER 3: Public Marketplace Catalog      │
  │  --------------------------------------  │
  │  Community components "yogastore"         │
  │  installed from marketplace:              │
  │  StripePricingTable, CalendlyEmbed,       │
  │  MailchimpSignup                          │
  │                                           │
  │  → Same dynamic loading as Layer 2        │
  │  → Different visibility scope            │
  │  → Tenant "installs" from marketplace     │
  └──────────────────────────────────────────┘
```

### Resolution: Last Wins (Override Pattern)

If a tenant registers a component named `Button`, it overrides the platform `Button`. Same for public marketplace overrides. Resolution order:

```
1. Tenant Private (highest priority)
2. Public Marketplace
3. Platform Base (lowest priority / fallback)
```

---

## How Dynamic Catalog Loading Works

### Step 1: Client Bundles the Platform Catalog

The platform catalog is prebuilt into the client bundle as an immutable JS chunk:

```
packages/client/
├── src/
│   ├── catalog.ts              # Platform base catalog (defineCatalog + defineRegistry)
│   ├── catalog-registry.ts     # Registry mapping (stays as is)
│   ├── catalog-loader.ts       # Dynamic catalog loader (NEW)
│   └── ...
```

Built once, cached in R2 with 1-year immutable header. Every tenant gets this chunk.

### Step 2: Edge Worker Returns Catalog Manifest

When the browser requests a page, the edge worker also returns which catalogs are active:

```json
// GET /api/edge/schema/:siteId response (extended)
{
  "spec": { "root": "...", "elements": { ... } },
  "catalogs": {
    "platform": {
      "url": "/_assets/platform-catalog-v2.js",
      "hash": "abc123"
    },
    "private": {
      "url": "/_assets/tenants/yogastore/catalog.js",
      "hash": "def456"
    },
    "marketplace": [
      {
        "name": "stripe-pricing",
        "url": "/_assets/marketplace/stripe-pricing-v1.js",
        "hash": "ghi789"
      }
    ]
  }
}
```

### Step 3: Client Dynamically Imports Tenant Catalogs

The client bundle has a `catalog-loader.ts` that:

```typescript
// Pseudo-code — concept only
async function loadCatalogs(manifest: CatalogManifest) {
  const registries = [platformRegistry]; // Layer 1 (already bundled)

  // Layer 3: Marketplace catalogs (parallel import)
  for (const pkg of manifest.marketplace) {
    const mod = await import(/* webpackIgnore: true */ pkg.url);
    registries.push(mod.registry);
  }

  // Layer 2: Tenant private catalog (highest priority, loaded last)
  if (manifest.private) {
    const mod = await import(/* webpackIgnore: true */ manifest.private.url);
    registries.push(mod.registry);
  }

  return mergeRegistries(registries); // Last wins
}
```

### Step 4: Catalog Merge Strategy

A merged registry where later registries override earlier ones for the same component name. The component type (`string`) remains the same — only the React implementation changes.

---

## How Tenant Components Are Built & Served

### Build Pipeline (per tenant)

```
Tenant uploads component JSX via Admin UI
         │
         ▼
┌──────────────────────────────┐
│  API Server                  │
│  POST /api/tenants/:id/      │
│       components             │
│                              │
│  1. Validate JSX             │
│  2. Bundle via esbuild       │
│     (server-side, isolated)  │
│  3. Store JS bundle in R2    │
│     key: tenants/{id}/       │
│           catalog.js         │
│  4. Update catalog manifest  │
│     in Postgres              │
│  5. Purge Worker KV cache    │
└──────────────────────────────┘
         │
         ▼
┌──────────────────────────────┐
│  Edge Worker                 │
│                              │
│  Next request:               │
│  KV miss → fetch from API    │
│  → new manifest includes     │
│    new component URL         │
│  → client downloads +        │
│    registers new component   │
└──────────────────────────────┘
```

### Component Package Format

Each dynamically loaded catalog is a standalone ES module:

```javascript
// tenants/yogastore/catalog.js (built output)
import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { defineRegistry } from "@json-render/react";
import { z } from "zod";

const catalog = defineCatalog(schema, {
  components: {
    YTClassSchedule: {
      props: z.object({ ... }),
      slots: ["default"],
      description: "Yoga class schedule grid"
    }
  }
});

export const { registry } = defineRegistry(catalog, {
  components: {
    YTClassSchedule: ({ props, children }) => {
      // React implementation
    }
  }
});
```

**Key constraint:** Each dynamic catalog is self-contained. It bundles its own `@json-render/core` and `@json-render/react` imports. No shared runtime dependency issues because the client already has these loaded.

---

## Public vs Private — Marketplace Architecture

### Storage & Visibility

| Aspect | Private | Public Marketplace |
|--------|---------|-------------------|
| Storage | R2: `tenants/{id}/catalog.js` | R2: `marketplace/{pkg}/catalog.js` |
| Visibility | Only `tenantId` can resolve | Any tenant can "install" |
| Approval | Tenant self-publishes | Platform review (or auto-approve) |
| Versioning | Tenant controls versions | Publisher controls versions, tenants pin |
| Billing | Part of platform plan | Marketplace rev share |

### Tenant Install Flow

```
1. Tenant browses marketplace (admin UI)
2. Tenant clicks "Install" on StripePricingTable
3. API: POST /api/tenants/:id/marketplace/install { package: "stripe-pricing" }
4. Server adds to tenant's catalog manifest
5. Next page load: client downloads stripe-pricing catalog
6. StripePricingTable component available in tenant's catalog
```

---

## Efficiency & Caching

### Immutable Platform Catalog
- Built once into client bundle, R2-cached for 1 year
- Content hash in filename (`platform-catalog-a3f2.js`)
- New platform version = new filename = instant cache miss

### Tenant Catalog Caching
- R2: immutable per version (hash in filename)
- Worker KV: catalog manifest cached, purged on update
- Browser: `import()` caches the module naturally (ES module cache)

### Payload Size
- Platform: ~20 components = ~100 KB gzipped (one-time, shared)
- Tenant private: 0-5 components, negligible (lazy-loaded)
- Marketplace: per-package, lazy-loaded on demand

---

## Catalog Manifest API

### Server Endpoint (proposed)

```
GET /api/tenants/:id/catalog
→ Returns the merged catalog manifest for this tenant's active components

Response:
{
  "platform": { "version": "2", "hash": "abc123" },
  "private": { "version": "5", "hash": "def456" },
  "marketplace": [
    { "name": "stripe-pricing", "version": "1", "hash": "ghi789" }
  ]
}
```

### How It Gets Served

```
Browser → Edge Worker → Worker KV (manifest cache)
                            │
                            └── Miss → API Server
                                          │
                                          ├── Postgres: tenant catalog config
                                          └── Returns merged manifest → KV cache
```

---

## What Changes in Current Code

### packages/client (changes needed)

| File | Change |
|------|--------|
| `catalog.ts` | Renamed to `platform-catalog.ts`, stays as platform base |
| `registry.ts` | Renamed to `platform-registry.ts` |
| `catalog-loader.ts` | NEW — dynamic import + merge logic |
| `main.tsx` | Updated: calls `loadCatalogs(manifest)` before render |

### packages/server (new route)

| Route | Purpose |
|-------|---------|
| `GET /api/tenants/:id/catalog` | Returns merged catalog manifest |
| `POST /api/tenants/:id/components` | Upload/build tenant component |
| `DELETE /api/tenants/:id/components/:name` | Remove tenant component |

### packages/workers (changes needed)

| File | Change |
|------|--------|
| `routes/static.ts` | Already serves `/_assets/*` from R2 — no change needed |
| `routes/api.ts` | Already proxies to API server — catalog manifest comes through |

---

## Migration Path

### Phase 1 (now): Hardcoded catalog
- Current state. Single catalog in client bundle. Works for demo.

### Phase 2 (next): Extract platform catalog, add manifest
- Rename current catalog to "platform"
- Add `GET /api/tenants/:id/catalog` endpoint (returns platform-only for now)
- Client loads via manifest instead of hardcoded import

### Phase 3: Tenant private catalogs
- Build pipeline for server-side JSX → ES module bundling
- R2 storage per tenant
- Dynamic `import()` in client

### Phase 4: Marketplace
- Publication flow, install/uninstall, versioning, billing
