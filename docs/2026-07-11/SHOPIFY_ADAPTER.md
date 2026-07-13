# Shopify Adapter — Design Document

## Date: 2026-07-11

---

## Decision: Adapter Lives Inside `packages/server`, Not a Separate Package

The Shopify adapter is a **port implementation** inside the existing server monolith, following the same DDD ports/adapters pattern used by all 8 existing domains. It does not warrant a separate monorepo package.

### Why Not a Separate Package

| Concern | Separate package | Inside server (chosen) |
|---|---|---|
| Dependencies | Duplicate Drizzle, Hono, Zod — same versions must align | Shares existing deps, zero version conflicts |
| Deployability | Not independently deployable (no API surface of its own) | Co-deployed with server (same process) |
| Import pattern | Server must import from external package → circular risk | Direct import, same module graph |
| Testing | Separate test suite, CI complexity | Same vitest config, same CI |
| Maintainability | Two package.jsons, two tsconfigs, two build pipelines | One config, zero overhead |
| Boundary clarity | Falsely suggests independent lifecycle | Clear: it's a port implementation, not a bounded context |

The adapter pattern is *inversion of dependency* — the domain depends on a `CommerceAdapter` port (interface), the adapter implements it. Both live in the same codebase. Extracting to a separate package adds a packaging boundary where an architectural boundary already exists.

---

## Placement: New `commerce` Domain

```
packages/server/src/domains/commerce/
├── api.ts              ← Hono routes (cart, checkout, orders)
├── ports.ts            ← CommerceAdapter interface + DTOs
├── service.ts          ← CommerceService (cart logic, order logic)
├── schema.ts           ← Drizzle schemas (carts, orders, products)
├── events.ts           ← Domain events
├── adapters/
│   ├── shopify.ts      ← ShopifyAdapter (Storefront API)
│   └── standalone.ts   ← StripeConnectAdapter (our own DB + Stripe)
├── index.ts            ← createCommerceDomain() factory
└── commerce.test.ts
```

### Factory Pattern

```typescript
// ports.ts
export interface CommerceAdapter {
  getProducts(tenantId: string, context: CommerceContext): Promise<ProductDTO[]>;
  getProduct(tenantId: string, id: string, context: CommerceContext): Promise<ProductDTO>;
  createCart(tenantId: string, visitorId: string): Promise<CartDTO>;
  addToCart(tenantId: string, cartId: string, item: CartItem): Promise<CartDTO>;
  createCheckout(tenantId: string, cartId: string): Promise<CheckoutDTO>;
  getOrders(tenantId: string): Promise<OrderDTO[]>;
  getOrder(tenantId: string, id: string): Promise<OrderDTO>;
}

// index.ts
export function createCommerceDomain(options: {
  db: PostgresDB;
  adapter: CommerceAdapter;  // ← injected at startup
}) {
  const service = new CommerceService(options.adapter);
  return { routes: createRoutes(service), service };
}
```

### Startup Wiring (`index.ts`)

```typescript
// Mode selection via env var:
const adapterMode = process.env.COMMERCE_ADAPTER || "standalone";

const commerceAdapter: CommerceAdapter = adapterMode === "shopify"
  ? createShopifyAdapter({
      storeDomain: process.env.SHOPIFY_STORE_DOMAIN!,
      storefrontAccessToken: process.env.SHOPIFY_STOREFRONT_TOKEN!,
    })
  : createStandaloneAdapter({ db });

const commerce = createCommerceDomain({ db, adapter: commerceAdapter });
app.route("/api/commerce", commerce.routes);
```

---

## ShopifyAdapter Implementation (`adapters/shopify.ts`)

### Dependencies

| Package | Purpose |
|---------|---------|
| `@shopify/storefront-api-client` | Typed client for Storefront API |
| `graphql-request` or native `fetch` | GraphQL queries/mutations |

### Core Methods

```typescript
export function createShopifyAdapter(config: {
  storeDomain: string;
  storefrontAccessToken: string;
}): CommerceAdapter {
  const endpoint = `https://${config.storeDomain}/api/2024-10/graphql.json`;
  const headers = {
    "X-Shopify-Storefront-Access-Token": config.storefrontAccessToken,
    "Content-Type": "application/json",
  };

  async function graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables }),
    });
    const json = await res.json() as { data: T; errors?: unknown };
    if (json.errors) throw new Error(JSON.stringify(json.errors));
    return json.data;
  }

  return {
    async getProducts(tenantId, context) {
      const data = await graphql<{ products: { nodes: ShopifyProduct[] } }>(`
        query getProducts($first: Int!) {
          products(first: $first) {
            nodes {
              id title handle description
              featuredImage { url altText width height }
              priceRange { minVariantPrice { amount currencyCode } }
              variants(first: 10) { nodes { id title price { amount } availableForSale } }
            }
          }
        }
      `, { first: 100 });
      return data.products.nodes.map(mapShopifyProduct);
    },

    async getProduct(tenantId, id) { /* single product query */ },
    async createCart(tenantId, visitorId) { /* cartCreate mutation */ },
    async addToCart(tenantId, cartId, item) { /* cartLinesAdd mutation */ },
    async createCheckout(tenantId, cartId) { /* checkoutCreate mutation */ },
    async getOrders(tenantId) { /* customer orders query with accessToken */ },
    async getOrder(tenantId, id) { /* single order */ },
  };
}
```

### Product Mapping (Shopify → Internal DTO)

```typescript
function mapShopifyProduct(sp: ShopifyProduct): ProductDTO {
  return {
    id: sp.id,
    title: sp.title,
    handle: sp.handle,
    description: sp.description,
    image: sp.featuredImage ? {
      url: sp.featuredImage.url,
      alt: sp.featuredImage.altText ?? sp.title,
      width: sp.featuredImage.width,
      height: sp.featuredImage.height,
    } : null,
    price: Number(sp.priceRange.minVariantPrice.amount),
    currency: sp.priceRange.minVariantPrice.currencyCode,
    variants: sp.variants.nodes.map(v => ({
      id: v.id,
      title: v.title,
      price: Number(v.price.amount),
      available: v.availableForSale,
    })),
  };
}
```

### Caching Strategy

Shopify Storefront API has rate limits. All product reads should be cached:

```
Products:     Cache in Redis/KV for 5 minutes
Collections:  Cache for 10 minutes
Cart:         No cache (ephemeral, client-owned)
Orders:       Customer-access-token scoped, no cross-tenant cache
```

The adapter itself does NOT implement caching — the `CommerceService` layer handles it via the same cache infrastructure used by the documents domain.

---

## Standalone Adapter (`adapters/standalone.ts`)

Already partially wired. Uses our own Drizzle tables for products, orders, etc. Stripe handles payments (never touch PCI).

```typescript
export function createStandaloneAdapter(opts: { db: PostgresDB }): CommerceAdapter {
  return {
    async getProducts(tenantId) {
      return opts.db.select().from(products).where(eq(products.tenantId, tenantId));
    },
    async createCart(tenantId, visitorId) { /* Redis-backed ephemeral cart */ },
    async createCheckout(tenantId, cartId) {
      // Create Stripe Checkout Session → return URL
      const session = await stripe.checkout.sessions.create({ /* ... */ });
      return { url: session.url! };
    },
    // ...
  };
}
```

---

## Status

| Component | Status |
|---|---|
| CommerceAdapter interface | Not yet created |
| Shopify adapter | Not started (deferred — standalone first per ARCHITECTURE_DECISIONS.md) |
| Standalone adapter | Partially wired via machines domain (cart/checkout state machines) |
| commerce domain | Not created as separate domain — cart/checkout logic lives in machines domain |

### Build Order

1. **Standalone first** — products table + Stripe Checkout integration (Phase 0)
2. **CommerceAdapter interface** — extract from machines domain (Phase 1)
3. **Shopify adapter** — Storefront API integration (Phase 2, when first Shopify merchant onboards)

### Why Standalone First

Per `STATUS.md:127`: The platform launches in standalone mode. Shopify adapter is added when the first merchant requests it. The adapter pattern (interface + injection) ensures the switch is a config change, not a rewrite.

---

## Not a Separate Package

Reaffirmed: the Shopify adapter is a `server` package concern. Same as how `documents/adapters/postgres.ts` implements `DocumentStorage` — the adapter IS part of the server, not a peer package. The domain layer (`ports.ts`) defines the contract. The adapter layer (`adapters/shopify.ts`) implements it. Both exist in the same package because they share the same runtime, same dependencies, and same deployment unit.
