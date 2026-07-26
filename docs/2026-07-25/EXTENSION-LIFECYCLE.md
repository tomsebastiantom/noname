# Extension Lifecycle — Full Bundle (Not JSON Alone)

> **Date:** 2026-07-25  
> **Status:** Adopted — documents what each profession/vision needs beyond layout JSON  
> **Related:** [`EXTENSIONS.md`](./EXTENSIONS.md), [`CLIENT-CATALOG-LAYERS.md`](./CLIENT-CATALOG-LAYERS.md), [`ROADMAP-PHASES.md`](./ROADMAP-PHASES.md), [`CONTENT-RENDER-PIPELINE.md`](./CONTENT-RENDER-PIPELINE.md), [`ARCHITECTURE-MAP.md`](./ARCHITECTURE-MAP.md)

---

## Core idea

A **layout spec (JSON file)** is only the merchant-facing **page content**. It is **not** an extension.

An **extension** is a **bundle** of platform-shipped assets. Enabling `"commerce"` for an org must wire **all** of these together:

| # | Asset | What it is | Package / storage |
|---|--------|------------|-------------------|
| 1 | **Manifest flag** | Which extensions this org may load | `PUT /api/tenants/:slug/catalog` |
| 2 | **Catalog schemas** | Zod: valid component props + action params | `extensions/src/{name}/catalog-schemas.ts` |
| 3 | **Components + actions** | React UI + side effects | `extensions/src/{name}/components.tsx`, `actions.ts` |
| 4 | **Registry** | Wires schemas → handlers for json-render | `extensions/src/{name}/registry.ts` |
| 5 | **Machine definitions** | Server workflows (cart, booking, …) | `extensions/src/{name}/machines/*.json` |
| 6 | **Layout spec** | Which components appear on a page + prop values / `$state` slots | Postgres document (`layout` type) |
| 7 | **CSS / design** | How components look | Host Tailwind + shadcn (not in spec JSON) |

**JSON alone (step 6)** cannot add `ProductCard` if steps 1–5 were never shipped and enabled.

---

## Three layers (recap)

```
Core        →  always loaded (LoginForm, Stack, auth, navigate)
Extension   →  optional first-party bundle (commerce, booking, …)
Remote      →  per-tenant MF custom (manifest.private / marketplace)
```

| Layer | Who ships it | Merchant edits it? |
|-------|--------------|-------------------|
| Core | Platform | No — only props via spec (e.g. LoginForm title) |
| Extension | Platform | No — enable/disable via manifest |
| Layout spec | Merchant / seed / admin | Yes — components + **prop values** |
| Remote | Merchant dev | Yes — custom React bundle |

---

## Schema variables (catalog schemas)

**Schemas are not the layout spec.** They define **what variables are allowed** when someone writes a spec or uses an editor.

Defined in `catalog-schemas.ts` per extension (core has its own in `packages/client/src/core/catalog-schemas.ts`).

### Component props schema

Tells json-render: “`ProductCard` may have these props, with these types.”

```typescript
// packages/extensions/src/commerce/catalog-schemas.ts
ProductCard: {
  props: z.object({
    productId: z.string(),      // required — used by addToCart action
    title: z.string(),
    price: z.number(),
    image: z.string().nullable(),
    description: z.string().nullable(),
  }),
}
```

### Action params schema

Tells json-render / admin: “`addToCart` accepts these params.”

```typescript
addToCart: {
  params: z.object({
    productId: z.string(),
    quantity: z.number().min(1).default(1),
  }),
}
```

### Layout spec uses those variables (values only)

The **published layout document** supplies concrete values. It does **not** redefine types:

```json
{
  "type": "ProductCard",
  "props": {
    "productId": "demo-sneakers",
    "title": "Blue Sneakers",
    "price": 99.99,
    "image": null,
    "description": "Comfortable running shoes."
  }
}
```

If `productId` is missing, validation fails against the schema — the spec is invalid, not the extension package.

| Concept | File / place | Role |
|---------|--------------|------|
| **Schema** | `catalog-schemas.ts` | Allowed keys + types (platform contract) |
| **Spec** | Postgres layout document | Actual page tree + prop **values** |
| **Manifest** | Tenant catalog API | Which extension **code** is loaded |

---

## End-to-end flow (commerce example)

### 1. Platform ships extension package

```
packages/extensions/src/commerce/
├── catalog-schemas.ts    ← schemas (variables)
├── components.tsx        ← ProductCard, Hero
├── actions.ts            ← addToCart → /api/machines/*
├── cart.ts               ← cart instance lifecycle
├── registry.ts           ← defineRegistry(...)
└── machines/
    └── cart.json         ← server machine definition
```

Registered in `packages/extensions/src/index.ts`:

```typescript
extensionLoaders: {
  commerce: () => import("./commerce/registry"),
}
```

### 2. Org enables extension (manifest)

```http
PUT /api/tenants/yogastore/catalog
Content-Type: application/json

{
  "platform": { "version": "1", "hash": "commerce-demo" },
  "extensions": ["commerce"]
}
```

Client fetches manifest → `catalog-loader` dynamically imports commerce registry → merges with core.

**Today:** machine def registration is done by seed script (`POST /api/machines/definitions`).  
**Target:** server registers `machines/*.json` automatically when extension is enabled.

### 3. Machine definition (server)

```json
{
  "name": "cart",
  "initial": "active",
  "states": {
    "active": {
      "on": {
        "addToCart": { "target": "active" }
      }
    }
  }
}
```

Generic API — no `/api/commerce/*`:

```http
POST /api/machines/start          { "machineName": "cart", "context": { "items": [] } }
POST /api/machines/:id/addToCart  { "items": [...] }
```

### 4. Layout spec (merchant page)

Seeded by `pnpm seed:demo:commerce` (example tree):

```json
{
  "root": "main",
  "elements": {
    "main": {
      "type": "Stack",
      "props": { "direction": "column", "gap": 24, "align": "stretch" },
      "children": ["hero", "products"]
    },
    "hero": {
      "type": "Hero",
      "props": {
        "title": "Welcome to Noname",
        "subtitle": "Commerce extension demo layout",
        "image": null,
        "ctaLabel": null,
        "ctaAction": null
      }
    },
    "products": {
      "type": "Grid",
      "props": { "columns": 2, "gap": 16 },
      "children": ["product1"]
    },
    "product1": {
      "type": "ProductCard",
      "props": {
        "productId": "demo-sneakers",
        "title": "Blue Sneakers",
        "price": 99.99,
        "image": null,
        "description": "Comfortable running shoes."
      }
    }
  }
}
```

### 5. Runtime in browser

```
Fetch manifest     → extensions: ["commerce"]
loadCatalogs()     → core registry + commerce registry
Fetch layout spec  → edge GET .../schema/yogastore?template=home
Renderer           → Stack, Grid (core) + Hero, ProductCard (commerce)
User clicks Add    → commerce action → machines API
```

### 6. CSS (not in spec)

- **Login:** core `LoginForm` — scoped `.noname-auth` + shadcn in host app
- **Commerce components:** host Tailwind scans `packages/extensions/src/**` (classes allowed); commerce still uses inline styles today — migrate to shadcn over time
- **Merchant spec:** never contains CSS — only component types and props

---

## Hypothetical second vision: booking

Same checklist — **not** a single JSON file:

| # | Booking example |
|---|-----------------|
| 1 Manifest | `{ "extensions": ["booking"] }` |
| 2 Schemas | `BookingCalendar` props: `{ serviceId, timezone }`; action `bookSlot` params: `{ slotId }` |
| 3 Components | `BookingCalendar.tsx`, `ServiceCard.tsx` |
| 4 Actions | `bookSlot` → `POST /api/machines/:id/bookSlot` |
| 5 Machines | `machines/appointment.json` — states: `pending`, `confirmed`, `cancelled` |
| 6 Layout spec | `{ "type": "BookingCalendar", "props": { "serviceId": "yoga-60", "timezone": "America/New_York" } }` |
| 7 CSS | Host Tailwind + shadcn — same as commerce |

Org with `"extensions": ["booking"]` never loads commerce `ProductCard`. Org with `"extensions": ["commerce"]` never loads `BookingCalendar`.

---

## Core vs extension (login stays core)

| In **core** (always) | In **extension** (manifest) |
|----------------------|----------------------------|
| `LoginForm`, auth actions | `ProductCard`, `addToCart` |
| `Stack`, `Grid`, `Button`, `navigate` | `Hero`, checkout flows |
| `.noname-auth` scoped UI | Domain-specific machines |

Login is **not** an extension — every org gets the same **core** auth components; merchants customize via **login layout spec props** + **`tenant_settings.auth`** (admin UI), not new packages. See [`ORG-AUTH-CONFIG.md`](./ORG-AUTH-CONFIG.md).

---

## Tenant custom code (optional 4th piece)

When first-party extensions are not enough:

```json
{
  "extensions": ["commerce"],
  "private": {
    "name": "tenant-yogastore",
    "url": "https://r2.example/tenants/yogastore/remoteEntry.js",
    "hash": "...",
    "version": 1
  }
}
```

- Built separately (Module Federation)
- Loaded by `catalog-loader` after extensions
- Shares React / json-render from host
- Merchant owns component **code**; platform still owns manifest + spec validation against merged schemas

---

## What we validated vs what is still manual

| Piece | Commerce today | Target |
|-------|----------------|--------|
| Manifest `extensions: ["commerce"]` | ✅ seed | ✅ persist in Postgres |
| Client registry merge | ✅ | ✅ |
| Catalog schemas (Zod) | ✅ | ✅ |
| Layout spec JSON | ✅ seed (separate `home` / `store` keys) | Admin UI publish |
| Machine def registration | ⚠️ seed script POST | Auto on extension enable |
| Extension CSS | ⚠️ inline styles | shadcn in host |
| Template routing | ⚠️ client uses `template=home` | Align with published layout key |

---

## Checklist: adding a new extension

Use this for every new profession/vision (booking, membership, influencer, …):

- [ ] `packages/extensions/src/{name}/catalog-schemas.ts` — component + action schemas
- [ ] `packages/extensions/src/{name}/components.tsx` — UI
- [ ] `packages/extensions/src/{name}/actions.ts` — side effects (prefer machines API)
- [ ] `packages/extensions/src/{name}/registry.ts` — defineRegistry
- [ ] `packages/extensions/src/{name}/machines/*.json` — workflow defs
- [ ] Register in `extensionLoaders` in `extensions/src/index.ts`
- [ ] Seed or admin: `PUT .../catalog` with `extensions: ["{name}"]`
- [ ] Seed or admin: register machine defs for org
- [ ] Seed or admin: publish layout spec using **only** types from core + that extension
- [ ] Tailwind: use host classes (content path already includes `extensions/src`)

**Do not** skip the package and only add a JSON layout — the renderer will not find the component types.

---

## References

- [`EXTENSIONS.md`](./EXTENSIONS.md) — naming + three layers
- [`CLIENT-CATALOG-LAYERS.md`](./CLIENT-CATALOG-LAYERS.md) — core vs extension code layout
- [`CLIENT-ACTIONS.md`](./CLIENT-ACTIONS.md) — action handler split
- [`MODULE_FEDERATION.md`](../2026-07-11/MODULE_FEDERATION.md) — tenant remotes
- Example commerce spec: `scripts/seed-demo-commerce.ts`
- Example schemas: `packages/extensions/src/commerce/catalog-schemas.ts`
