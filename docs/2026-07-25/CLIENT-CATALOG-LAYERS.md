# Client Catalog Layers — Core vs Verticals

> **Date:** 2026-07-25  
> **Status:** Implemented in `packages/client/src/`  
> **Related:** [`CLIENT-ACTIONS.md`](./CLIENT-ACTIONS.md), [`ARCHITECTURE_DECISIONS.md`](../2026-07-04/ARCHITECTURE_DECISIONS.md)

---

## Framing

**Noname is not an e-commerce product.** Commerce is the **first vertical pack** we ship for demo/validation. Influencer, booking, membership, SaaS, etc. get their own packs the same way.

The client host bundle is:

```
core (always)  +  enabled vertical packs  +  tenant MF remotes (manifest)
```

---

## Layers

| Layer | Path | Loaded | Examples |
|-------|------|--------|----------|
| **Core platform** | `src/core/` | Every org | `Stack`, `Grid`, `Button`, `navigate` |
| **Vertical pack** | `src/verticals/{name}/` | Host config + future manifest | `commerce`: `ProductCard`, `addToCart` |
| **Tenant private** | MF remote (R2) | Per org manifest | Custom widgets/actions |
| **Marketplace** | MF remote | Per org manifest | Third-party packs |

An influencer site loads **core + influencer vertical** — not commerce `addToCart` unless that pack is enabled.

---

## Code layout (today)

```
packages/client/src/
├── core/
│   ├── catalog-schemas.ts    ← Zod: layout components + navigate
│   ├── components.tsx
│   └── actions/navigation.ts
├── verticals/
│   └── commerce/             ← demo vertical only
│       ├── catalog-schemas.ts
│       ├── components.tsx
│       └── actions.ts
├── platform/
│   ├── catalog.ts            ← core only → defineCatalog
│   └── registry.ts           ← core handlers → defineRegistry
├── catalog.ts                ← re-export platform/catalog
├── registry.ts               ← re-export platform/registry
└── catalog-loader.ts         ← merge platform + manifest verticals + MF remotes
```

---

## Enabling verticals

**Default:** core platform only. No vertical packs in the host bundle unless the org manifest lists them.

**Manifest:**

```json
{
  "platform": { "version": "1", "hash": "..." },
  "verticals": ["commerce"],
  "private": null,
  "marketplace": []
}
```

`catalog-loader` dynamically imports only listed verticals. Influencer org: `"verticals": ["influencer"]` — no commerce code loaded at runtime.

**Dev seeds:** `pnpm seed:demo` (core layout). `pnpm seed:demo:commerce` enables commerce vertical + Hero/ProductCard layout.

---

## Adding a new vertical

1. Create `src/verticals/{name}/catalog-schemas.ts`, `components.tsx`, `actions.ts`, `registry.ts`
2. Register loader in `catalog-loader.ts` `VERTICAL_LOADERS`
3. Add to manifest `verticals` for orgs that need it
4. Optional: lazy MF bundle per vertical later (same pattern as tenant remotes)

---

## Core vs vertical (rules)

| Belongs in **core** | Belongs in a **vertical** |
|---------------------|---------------------------|
| Layout primitives (Stack, Grid, Text, Button, Image) | Domain UI (ProductCard, BookingCalendar) |
| Auth actions (`login`, `logout`) — when added | Domain actions (`addToCart`, `bookSlot`) |
| `navigate` | Checkout, cart, subscriptions |
| LoginForm (planned) | Hero tuned for one vertical |

---

## References

- [`CLIENT-ACTIONS.md`](./CLIENT-ACTIONS.md) — action handler split
- [`MODULE_FEDERATION.md`](../2026-07-11/MODULE_FEDERATION.md) — tenant remotes
- [`LOGIN-UI-PLAN.md`](./LOGIN-UI-PLAN.md) — login in core catalog
