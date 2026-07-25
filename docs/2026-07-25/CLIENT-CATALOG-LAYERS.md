# Client Catalog Layers — Core vs Extensions

> **Date:** 2026-07-25  
> **Status:** Implemented  
> **Related:** [`EXTENSIONS.md`](./EXTENSIONS.md), [`CLIENT-ACTIONS.md`](./CLIENT-ACTIONS.md), [`ARCHITECTURE_DECISIONS.md`](../2026-07-04/ARCHITECTURE_DECISIONS.md)

---

## Framing

**Noname is not an e-commerce product.** Commerce is the **first extension** we ship for demo/validation. Influencer, booking, membership, SaaS, etc. get their own extensions the same way.

The client host bundle is:

```
core (always)  +  enabled extensions (manifest)  +  tenant MF remotes (manifest)
```

See [`EXTENSIONS.md`](./EXTENSIONS.md) for the naming decision (extension vs pack/plugin/domain).

---

## Layers

| Layer | Path | Loaded | Examples |
|-------|------|--------|----------|
| **Core platform** | `packages/client/src/core/` | Every org | `Stack`, `Grid`, `Button`, `navigate` |
| **Extension** | `packages/extensions/src/{name}/` | Manifest `extensions` | `commerce`: `ProductCard`, `addToCart` |
| **Tenant private** | MF remote (R2) | Per org manifest | Custom widgets/actions |
| **Marketplace** | MF remote | Per org manifest | Third-party bundles |

An influencer site loads **core + influencer extension** — not commerce `addToCart` unless that extension is enabled.

---

## Code layout

```
packages/client/src/
├── core/
│   ├── catalog-schemas.ts    ← Zod: layout components + navigate
│   ├── components.tsx
│   └── actions/navigation.ts
├── platform/
│   ├── catalog.ts            ← core only → defineCatalog
│   └── registry.ts           ← core handlers → defineRegistry
├── catalog.ts                ← re-export platform/catalog
├── registry.ts               ← re-export platform/registry
└── catalog-loader.ts         ← merge platform + @noname/extensions + MF remotes

packages/extensions/src/      ← @noname/extensions
├── index.ts                  ← extensionLoaders map
├── types.ts
└── commerce/
    ├── catalog-schemas.ts
    ├── components.tsx
    ├── actions.ts
    └── registry.ts
```

---

## Enabling extensions

**Default:** core platform only. No extensions in the host bundle unless the org manifest lists them.

**Manifest:**

```json
{
  "platform": { "version": "1", "hash": "..." },
  "extensions": ["commerce"],
  "private": null,
  "marketplace": []
}
```

`catalog-loader` dynamically imports only listed extensions. Influencer org: `"extensions": ["influencer"]` — no commerce code loaded at runtime.

**Dev seeds:** `pnpm seed:demo` (core layout). `pnpm seed:demo:commerce` enables commerce extension + Hero/ProductCard layout.

---

## Adding a new platform or admin component

Follow [`SPEC-DRIVEN-UI.md`](./SPEC-DRIVEN-UI.md) — schema → component → action → layout document → optional `templateFromPath`.

## Adding a new extension

1. Create `packages/extensions/src/{name}/` with `catalog-schemas.ts`, `components.tsx`, `actions.ts`, `registry.ts`
2. Register loader in `packages/extensions/src/index.ts` `extensionLoaders`
3. Add to manifest `extensions` for orgs that need it
4. Optional: lazy MF bundle per extension later (same pattern as tenant remotes)

---

## Core vs extension (rules)

| Belongs in **core** | Belongs in an **extension** |
|---------------------|-----------------------------|
| Layout primitives (Stack, Grid, Text, Button, Image) | Domain UI (ProductCard, BookingCalendar) |
| Auth UI + actions (`LoginForm`, `login`, `logout`, `saveAuthConfig`) | Domain actions (`addToCart`, `bookSlot`) |
| Admin platform (`AdminShell`, `ContentEntryAdmin`, `AuthSettingsForm`) | Commerce-specific admin pages |
| `navigate` | Checkout, cart, subscriptions |

---

## References

- [`EXTENSIONS.md`](./EXTENSIONS.md) — naming decision
- [`CLIENT-ACTIONS.md`](./CLIENT-ACTIONS.md) — action handler split
- [`MODULE_FEDERATION.md`](../2026-07-11/MODULE_FEDERATION.md) — tenant remotes
- [`SPEC-DRIVEN-UI.md`](./SPEC-DRIVEN-UI.md) — spec-driven UI skeleton, anti-drift rules
