# Extensions — Naming & Architecture

> **Date:** 2026-07-25  
> **Status:** Adopted  
> **Related:** [`CLIENT-CATALOG-LAYERS.md`](./CLIENT-CATALOG-LAYERS.md), [`CLIENT-ACTIONS.md`](./CLIENT-ACTIONS.md)

---

## Decision

Optional use-case bundles are called **extensions**, not verticals, packs, plugins, or domains.

| Term | Verdict | Why |
|------|---------|-----|
| **Extension** | ✅ **Use in code/API** | Platform add-on (Shopify/Saleor pattern). Core + optional extensions. |
| Vertical | Product language only | Fine in pitch/docs (“commerce vertical”), not in manifest or packages. |
| Pack | Rejected for code | Informal; no strong OSS precedent. |
| Plugin | Rejected | Overloaded — means different things in Medusa, Payload, Backstage, Saleor. |
| Domain | Rejected | Collides with server `domains/` (documents, tenant, edge, machines). |
| App / Remote | Reserved | Per-tenant MF custom code (`manifest.private`), not first-party bundles. |

---

## Three layers

```
Core          →  always loaded (client + server)
Extension     →  optional first-party bundle (commerce, booking, …)
Remote        →  per-tenant MF custom (manifest.private / marketplace)
```

---

## What an extension is

One extension = one use-case bundle, enabled per org via manifest:

```json
{
  "platform": { "version": "1", "hash": "..." },
  "extensions": ["commerce"],
  "private": null,
  "marketplace": []
}
```

| Half | Today | Target |
|------|-------|--------|
| **Client** | Components + actions (`@noname/extensions/commerce`) | ✅ Implemented |
| **Server** | Generic machines API only | Extension ships machine defs (JSON); registered when enabled |

No commerce-specific API routes. Cart/checkout = **state machines** + JSONB context, not `domains/commerce/`.

**Important:** A layout spec (JSON document) alone is **not** an extension. See [`EXTENSION-LIFECYCLE.md`](./EXTENSION-LIFECYCLE.md) for the full bundle (manifest, schemas, components, actions, machines, spec, CSS) with commerce and booking examples.

---

## Code layout

```
packages/extensions/          @noname/extensions
├── src/index.ts              extensionLoaders, KNOWN_EXTENSIONS
├── src/types.ts
└── src/commerce/
    ├── catalog-schemas.ts
    ├── components.tsx
    ├── actions.ts
    └── registry.ts

packages/client/src/
├── core/                     platform only
├── platform/
└── catalog-loader.ts         merges core + manifest.extensions + MF remotes
```

---

## Adding an extension

Full checklist (manifest, schemas, components, actions, machines, layout spec, CSS): **[`EXTENSION-LIFECYCLE.md`](./EXTENSION-LIFECYCLE.md)**

Minimal steps:

1. Create `packages/extensions/src/{name}/` (schemas, components, actions, registry, `machines/*.json`)
2. Register in `extensionLoaders` in `packages/extensions/src/index.ts`
3. Enable per org: `PUT /api/tenants/:id/catalog` with `extensions: ["{name}"]`
4. Register machine defs + publish a layout spec that uses the extension's component types

---

## Dev seeds

| Command | What it does |
|---------|----------------|
| `pnpm seed:demo` | Core layout, `extensions: []` |
| `pnpm seed:demo:commerce` | Enables commerce extension + Hero/ProductCard layout |

---

## References

- [`EXTENSION-LIFECYCLE.md`](./EXTENSION-LIFECYCLE.md) — full bundle per extension (not JSON alone), schema variables, examples
- [`CLIENT-CATALOG-LAYERS.md`](./CLIENT-CATALOG-LAYERS.md) — core vs extension vs remote
- Saleor **extensions** — umbrella for optional platform capabilities
- Medusa **plugins** — rejected name; we use generic machines instead of commerce modules
