# Commerce Engine Gap Analysis
## What's Built vs. What's Missing vs. Top Platforms
### As of 2026-08-22

---

## Executive Summary

**Current State**: The platform has exceptional infrastructure (auth, collab, flags, machines, webhooks, analytics, tenant catalog) — **ahead of roadmap in many areas**. The custom inline visual editor is **substantially complete** and supersedes GrapesJS.

**Critical Gap**: **Commerce Engine is 0% built on the server side**. Only a client-side skeleton exists in `packages/extensions/src/commerce/`:
- `Hero` component ✅
- `ProductCard` component ✅
- `addToCart` / `checkout` actions (client-side only) ✅
- `cart` XState machine (definition only, no server persistence) ✅

**Missing**: 48 more components across two catalogs (50 planned total incl. Hero + ProductCard): 15 transactional-core + 21 commerce-expansion in the commerce extension, plus 12 domain-neutral site-catalog sections (header/footer/announcement/search/FAQ/media) that belong in a Site catalog, not commerce — full breakdown in `COMPONENT_CATALOG_REQUIREMENTS.md`. Also missing: entire server domain (`packages/server/src/domains/commerce/`), Stripe Connect integration, Shopify adapter, multi-currency, tax, shipping, order management.

---

## Top Ecommerce Platforms — Feature Comparison Matrix

Based on deep research of leading platforms (Shopify, WooCommerce, BigCommerce, commercetools, Medusa, Saleor, Vendure, Shopware 6, Elastic Path, Crystallize), here is what a **world-class commerce engine** must provide:

| Feature Category | Shopify | WooCommerce | BigCommerce | commercetools | Medusa | Saleor | Vendure | **Our Target** |
|-----------------|---------|-------------|-------------|---------------|--------|--------|---------|----------------|
| **Product Catalog** | | | | | | | | |
| Products with variants | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ Required |
| Product types/attributes | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ Required |
| Categories/collections | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ Required |
| Digital products | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ Required |
| Product bundles/kits | App | Plugin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ Required |
| Inventory tracking | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ Required |
| Multi-location inventory | ✅ | Plugin | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 Phase 2 |
| Product reviews/ratings | App | Plugin | App | Custom | Custom | Custom | Custom | ✅ Required |
| **Cart & Checkout** | | | | | | | | |
| Persistent cart (server) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ **Critical Gap** |
| Guest cart | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ Required |
| Authenticated user cart | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ Required |
| Cart merge on login | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ Required |
| Abandoned cart recovery | ✅ | Plugin | ✅ | Custom | Custom | Custom | Custom | 🟡 Phase 1 |
| Multi-step checkout | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ Required |
| Express checkout (Apple/Google Pay) | ✅ | Plugin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ Required |
| Custom checkout fields | Shopify Plus | Plugin | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 Phase 1 |
| **Payments** | | | | | | | | |
| Stripe | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ Required (Connect) |
| Shopify Payments | ✅ | N/A | N/A | N/A | N/A | N/A | N/A | ✅ Shopify Mode |
| PayPal | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 Phase 1 |
| Buy Now Pay Later | ✅ | Plugin | ✅ | Custom | Custom | Custom | Custom | 🟡 Phase 2 |
| Multi-currency | ✅ | Plugin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ Required |
| **Orders & Fulfillment** | | | | | | | | |
| Order management | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ Required |
| Order status workflow | ✅ | Plugin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ Required (XState) |
| Partial fulfillment | ✅ | Plugin | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 Phase 1 |
| Returns/RMA | App | Plugin | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 Phase 2 |
| Shipping labels | ✅ | Plugin | ✅ | Custom | ✅ | Custom | Custom | 🟡 Phase 2 |
| **Pricing & Promotions** | | | | | | | | |
| Discount codes | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ Required |
| Automatic discounts | ✅ | Plugin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ Required |
| Tiered/volume pricing | App | Plugin | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 Phase 1 |
| Customer group pricing | Shopify Plus | Plugin | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 Phase 1 |
| Gift cards | ✅ | Plugin | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 Phase 2 |
| **Tax & Compliance** | | | | | | | | |
| Automated tax calc | ✅ (Shopify Tax) | Plugin | ✅ | ✅ (Stripe Tax) | ✅ | Custom | ✅ | ✅ Required (Stripe Tax) |
| Tax nexus tracking | ✅ | Plugin | ✅ | Custom | Custom | Custom | Custom | 🟡 Phase 2 |
| GDPR/CCPA compliance | ✅ | Plugin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ Built-in |
| **B2B/Wholesale** | | | | | | | | |
| Company accounts | Shopify Plus | Plugin | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 Phase 3 |
| Net terms invoicing | Shopify Plus | Plugin | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 Phase 3 |
| Purchase orders | Shopify Plus | Plugin | ✅ | ✅ | Custom | Custom | Custom | 🟡 Phase 3 |
| Quote management | App | Plugin | ✅ | ✅ | Custom | Custom | Custom | 🟡 Phase 3 |
| **Subscriptions** | | | | | | | | |
| Recurring billing | App | Plugin | ✅ | ✅ | ✅ | Custom | Custom | 🟡 Phase 2 |
| Subscription management | App | Plugin | ✅ | ✅ | ✅ | Custom | Custom | 🟡 Phase 2 |
| **Multi-channel** | | | | | | | | |
| POS | ✅ | Plugin | App | Custom | Custom | Custom | Custom | 🟡 Phase 3 |
| Marketplaces (Amazon, eBay) | App | Plugin | App | Custom | Custom | Custom | Custom | 🟡 Phase 3 |
| Social commerce | App | Plugin | App | Custom | Custom | Custom | Custom | 🟡 Phase 2 |
| **Developer Experience** | | | | | | | | |
| GraphQL API | ✅ | Plugin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ Via json-render |
| REST API | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ Hono API |
| Webhooks | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ Built-in |
| Extensibility/Plugins | App Store | Plugins | Apps | Extensions | Plugins | Plugins | Plugins | ✅ Plugin System |
| **AI & Personalization** | | | | | | | | |
| AI product descriptions | ✅ (Magic) | Plugin | ✅ | Custom | Custom | Custom | Custom | ✅ **Our Differentiator** |
| Per-visitor personalization | ❌ | ❌ | ❌ | Custom | Custom | Custom | Custom | ✅ **Our Differentiator** |
| AI layout generation | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ **Our Differentiator** |
| ML optimization loop | ❌ | ❌ | ❌ | Custom | Custom | Custom | Custom | ✅ **Our Differentiator** |
| Manageable AI agents | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ **Our Differentiator** |

> **Market update (Aug 2026)**: commercetools shipped an AI Hub plus a standalone agentic-commerce product, **AgenticLift** (Jan 2026), letting AI agents read product data and transact on top of existing enterprise stacks. This validates the agentic thesis but remains enterprise middleware — none of the surveyed platforms ship per-visitor layout generation, merchant-managed agent staff, or schema-level attribution.

---

## What We Have vs. What We Need

### Currently Implemented (Client-Side Only)

| Component | File | Status | Notes |
|-----------|------|--------|-------|
| `Hero` | `components.tsx` | ✅ Complete | Full-width banner with CTA |
| `ProductCard` | `components.tsx` | ✅ Complete | Image, title, price, add-to-cart |
| `addToCart` action | `actions.ts` | ✅ Client-only | Uses XState machine via `/api/machines/*` |
| `checkout` action | `actions.ts` | ✅ Client-only | Just `window.location.href = "/checkout"` |
| `cart` machine | `machines/cart.json` | ✅ Definition only | Single state "active", transition "addToCart" |
| Cart persistence | `cart.ts` | ✅ Client-only | `sessionStorage` + XState machine API |
| Component schemas | `catalog-schemas.ts` | ✅ Complete | Zod schemas for Hero + ProductCard |
| Action schemas | `catalog-schemas.ts` | ✅ Complete | Zod schemas for addToCart + checkout |
| json-render registry | `registry.ts` | ✅ Complete | Components + actions registered |

### Critical Missing: Server Commerce Domain

**No `packages/server/src/domains/commerce/` exists.** This is the **single largest gap** blocking Phase 0 completion.

Required structure (from CURRENT_STATUS.md):
```
packages/server/src/domains/commerce/
├── index.ts                    # Domain entry
├── products/
│   ├── schema.ts               # Product content type + variants
│   ├── service.ts              # CRUD, search, inventory
│   └── routes.ts
├── cart/
│   ├── machine.ts              # Enhanced XState cart machine
│   ├── service.ts              # Server cart persistence
│   └── routes.ts               # GET/POST /api/cart
├── checkout/
│   ├── service.ts              # Stripe Checkout Session creation
│   ├── webhook.ts              # Stripe webhook handler
│   └── routes.ts
├── orders/
│   ├── schema.ts
│   ├── service.ts
│   └── routes.ts
├── shopify/
│   ├── adapter.ts              # Storefront API implementation
│   └── routes.ts
└── index.ts                    # CommerceDomainDeps, createCommerceDomain
```

### Missing Commerce Catalog Components (Core 15 of 48)

The table lists only the transactional core. The full backlog adds 21 commerce-expansion components (filters, sliders, galleries, checkout flow, account panels) plus 12 domain-neutral site sections (header, footer, announcement bar, search, FAQ, media) that belong in a **Site catalog**, not commerce — see "Catalog Expansion" in `COMPONENT_CATALOG_REQUIREMENTS.md`.

| Component | Priority | Description |
|-----------|----------|-------------|
| `ProductGrid` | **Critical** | Grid of ProductCards with columns, filtering, pagination |
| `ProductInfo` | **Critical** | Detailed PDP: title, price, description, reviews, variants, images |
| `AddToCart` | **Critical** | Sticky mobile, inline variants; Apple/Google Pay; quantity selector |
| `CartDrawer` | **Critical** | Sliding drawer with item list, totals, quantity updates, remove |
| `CartSummary` | **Critical** | Subtotal, shipping estimate, tax, discount, total |
| `CheckoutButton` | **Critical** | Proceed to checkout with express options |
| `CollectionPage` | **High** | Product listing with filters, sort, pagination |
| `SearchResults` | **High** | Search results with facets, autocomplete |
| `Pagination` | **High** | Page navigation for collections/search |
| `ProductVariants` | **High** | Size/color/material selectors with price updates |
| `QuantitySelector` | **Medium** | Increment/decrement with min/max/stock validation |
| `TrustBadges` | **Medium** | Security, shipping, return policy indicators |
| `SocialProof` | **Medium** | Reviews carousel, UGC, "X people viewing" |
| `RelatedProducts` | **Medium** | Cross-sell/upsell with ML bundle algorithm |
| `ShippingEstimator` | **Medium** | Zip code input → shipping rates |

---

## Architecture Decisions for Commerce Engine

### 1. Dual-Path Data Abstraction (Already Designed)

```
interface CommerceAdapter {
  getProducts(storeId, context): Product[]
  getProduct(id, context): Product
  createCart(visitorId): Cart
  addToCart(cartId, item): Cart
  createCheckout(cartId, context): CheckoutURL
  getOrders(storeId): Order[]
  // ...
}

┌──────────────────────────┐  ┌──────────────────────────────┐
│ ShopifyAdapter           │  │ StripeConnectAdapter          │
│                          │  │                              │
│ Uses Shopify Storefront  │  │ Uses our own product DB +    │
│ API for products, cart,  │  │ Stripe Checkout API for      │
│ checkout, orders.        │  │ cart, checkout, payments.    │
│ Merchant keeps existing  │  │ Independent of any platform. │
│ Shopify setup.           │  │ Full data ownership.         │
└──────────────────────────┘  └──────────────────────────────┘
```

**Decision**: Build `StripeConnectAdapter` first (standalone mode). `ShopifyAdapter` second.

### 2. Cart Persistence Strategy

**Current**: Client-side `sessionStorage` + XState machine via `/api/machines/*`
**Target**: Server-persisted cart with Redis + Postgres

```
┌─────────────────────────────────────────────────────────────┐
│                    CART ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  GUEST USER                          AUTHENTICATED USER    │
│  ─────────────                        ──────────────────   │
│  1. Anonymous cart ID               1. User cart in DB     │
│     in cookie/session                 (persistent)         │
│  2. Redis session                   2. Merge on login:     │
│     (TTL: 30 days)                    guest → user cart    │
│  3. Sync to Postgres                3. Cross-device sync   │
│     on checkpoint                    (Redis + Postgres)    │
│                                                             │
│  API:                                                         │
│  GET    /api/cart                  → Get cart               │
│  POST   /api/cart/items            → Add item               │
│  PATCH  /api/cart/items/:id        → Update quantity        │
│  DELETE /api/cart/items/:id        → Remove item            │
│  POST   /api/cart/merge            → Merge guest→user       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3. Checkout Flow with Stripe Connect

```
┌─────────────────────────────────────────────────────────────┐
│                    CHECKOUT FLOW                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Client: POST /api/checkout/create                       │
│     { cartId, shippingAddress, billingAddress, email }     │
│                                                             │
│  2. Server:                                                 │
│     a. Validate cart + inventory                            │
│     b. Calculate totals (subtotal, shipping, tax, discount)│
│     c. Create Stripe Checkout Session                       │
│        - line_items from cart                               │
│        - shipping_options from config                       │
│        - customer_email                                     │
│        - metadata: { cartId, storeId, orderId }            │
│     d. Create pending Order record (status: "pending")     │
│     e. Return { checkoutUrl, sessionId }                   │
│                                                             │
│  3. Client: Redirect to checkoutUrl (Stripe hosted)        │
│                                                             │
│  4. Stripe Webhook: checkout.session.completed             │
│     a. Verify signature                                     │
│     b. Fulfill order:                                       │
│        - Decrement inventory                                │
│        - Create Order (status: "paid")                      │
│        - Clear cart                                         │
│        - Send confirmation email                            │
│        - Trigger fulfillment webhook                        │
│     c. Return 200 to Stripe                                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4. Product Schema (Content Type)

Products are **content entries** in the existing Documents domain. Need to define a `Product` content type:

```typescript
// Product content type schema (Zod)
const productSchema = z.object({
  // Core
  title: z.string(),
  handle: z.string(),           // URL slug
  description: z.string(),      // Rich text (documents)
  vendor: z.string().optional(),
  productType: z.string().optional(),
  tags: z.array(z.string()).default([]),
  
  // Variants
  variants: z.array(z.object({
    id: z.string(),
    title: z.string(),
    sku: z.string().optional(),
    barcode: z.string().optional(),
    price: z.number(),          // In cents
    compareAtPrice: z.number().optional(),
    inventoryQuantity: z.number().default(0),
    inventoryPolicy: z.enum(["deny", "continue"]).default("deny"),
    weight: z.number().optional(),
    weightUnit: z.enum(["g", "kg", "lb", "oz"]).optional(),
    requiresShipping: z.boolean().default(true),
    taxable: z.boolean().default(true),
    image: z.string().optional(), // Media ref
    options: z.record(z.string()), // { "Size": "Large", "Color": "Red" }
  })).min(1),
  
  // Media
  images: z.array(z.object({
    id: z.string(),
    url: z.string(),
    altText: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
  })).default([]),
  
  // SEO
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  
  // Status
  status: z.enum(["draft", "active", "archived"]).default("draft"),
  publishedAt: z.date().optional(),
  
  // Pricing rules
  priceRules: z.array(z.object({
    minQuantity: z.number(),
    price: z.number(),
    customerGroup: z.string().optional(),
  })).optional(),
  
  // Related
  relatedProductIds: z.array(z.string()).optional(),
  collectionIds: z.array(z.string()).optional(),
});
```

### 5. Order Schema

```typescript
const orderSchema = z.object({
  // Identity
  orderNumber: z.string(),        // Human-readable: #1001
  customerId: z.string().optional(), // Null for guest
  email: z.string().email(),
  phone: z.string().optional(),
  
  // Addresses
  shippingAddress: addressSchema,
  billingAddress: addressSchema,
  
  // Line items (snapshot at purchase)
  lineItems: z.array(z.object({
    productId: z.string(),
    variantId: z.string(),
    title: z.string(),
    variantTitle: z.string().optional(),
    sku: z.string().optional(),
    quantity: z.number(),
    price: z.number(),           // Unit price at purchase
    totalPrice: z.number(),      // price * quantity
    taxLines: z.array(z.object({
      title: z.string(),
      rate: z.number(),
      amount: z.number(),
    })).default([]),
    properties: z.record(z.string()).optional(),
  })),
  
  // Financials
  subtotal: z.number(),
  shippingTotal: z.number(),
  taxTotal: z.number(),
  discountTotal: z.number().default(0),
  total: z.number(),
  currency: z.string().default("USD"),
  
  // Payment
  paymentStatus: z.enum(["pending", "paid", "partially_refunded", "refunded", "voided"]),
  paymentGateway: z.string(),     // "stripe", "shopify_payments"
  paymentReference: z.string(),   // Stripe session ID
  
  // Fulfillment
  fulfillmentStatus: z.enum(["unfulfilled", "partial", "fulfilled", "restocked"]),
  fulfillments: z.array(z.object({
    trackingNumber: z.string().optional(),
    trackingUrl: z.string().optional(),
    lineItems: z.array(z.object({
      lineItemId: z.string(),
      quantity: z.number(),
    })),
    createdAt: z.date(),
  })).default([]),
  
  // Status workflow (XState)
  status: z.enum(["open", "archived", "cancelled"]),
  financialStatus: z.enum(["pending", "authorized", "paid", "partially_refunded", "refunded", "voided"]),
  
  // Metadata
  note: z.string().optional(),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.string()).optional(),
  
  // Timestamps
  createdAt: z.date(),
  updatedAt: z.date(),
  processedAt: z.date().optional(),
  cancelledAt: z.date().optional(),
});
```

---

## Implementation Priority Order (From CURRENT_STATUS.md)

### Week 1-2: Commerce Server Domain (Unblocks Everything)
```
packages/server/src/domains/commerce/
├── index.ts                    
├── products/
│   ├── schema.ts               
│   ├── service.ts              
│   └── routes.ts
├── cart/
│   ├── machine.ts              
│   ├── service.ts              
│   └── routes.ts               
├── checkout/
│   ├── service.ts              
│   ├── webhook.ts              
│   └── routes.ts
├── orders/
│   ├── schema.ts
│   ├── service.ts
│   └── routes.ts
├── shopify/
│   ├── adapter.ts              
│   └── routes.ts
└── index.ts                    
```

### Week 2-3: Complete Commerce Catalog
Add to `packages/extensions/src/commerce/`:
- `ProductGrid`, `ProductInfo`, `AddToCart` (sticky/inline variants)
- `CartDrawer`, `CartSummary`, `CheckoutButton`
- `CollectionPage`, `SearchResults`, `Pagination`
- Full edit metadata for each (auto-generated from Zod + overrides)

### Week 3: Wire Client ↔ Server Cart
- Replace `sessionStorage` cart with server API calls
- Authenticated user cart persistence
- Guest cart → user cart merge on login

### Week 4: Checkout Flow + Demo Store
- Stripe Checkout Session creation from server
- Webhook → order creation → inventory decrement
- AI generates storefront → merchant approves → visitor buys

---

## Competitive Differentiation: What We Build That Others Don't

| Feature | Shopify | commercetools | Medusa | Saleor | Vendure | **Us** |
|---------|---------|---------------|--------|--------|---------|--------|
| **Per-visitor layout generation** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ **Core** |
| **AI agents you manage** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ **Core** |
| **ML feedback loop** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ **Core** |
| **Schema-level attribution** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ **Core** |
| **Inline visual editor** | ⚠️ Basic | ❌ | ❌ | ❌ | ❌ | ✅ **Built** |
| **Unified data model** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ **Built** |
| **Built-in A/B testing** | App ($) | Custom | Custom | Custom | Custom | ✅ **Built** |
| **Feature flags** | App ($) | Custom | Custom | Custom | Custom | ✅ **Built** |
| **Real-time collab** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ **Built** |
| **Edge delivery** | Oxygen | Custom | Custom | Custom | Custom | ✅ **Built** |
| **Open source** | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ **Core** |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Stripe Connect complexity** | Medium | High | Use Stripe's pre-built Checkout; defer Elements to Phase 1 |
| **Inventory race conditions** | High | High | XState guards + `SELECT FOR UPDATE`; test concurrent checkout |
| **Shopify Storefront API limits** | Medium | Medium | Implement caching; respect rate limits; queue sync jobs |
| **Multi-currency/tax complexity** | High | Medium | Use Stripe Tax for calculation; build config UI later |
| **Order workflow complexity** | Medium | Medium | XState machines make this manageable; start simple |
| **Cart merge edge cases** | High | Medium | Define clear merge rules; test extensively |

---

## Success Criteria for Phase 0 Commerce Completion

- [ ] AI generates valid JSON (json-render spec) for 5 different store types
- [ ] json-render produces working UI from that JSON without manual fixes
- [ ] **A real visitor can add to cart and checkout (in both Shopify and standalone modes)**
- [ ] Context engine serves different schemas to mobile vs. desktop
- [ ] AI agent can accept a task, generate a variant, and show it for merchant approval
- [ ] End-to-end latency <500ms for cached schemas
- [ ] Demo store live: AI generates storefront, visitor sees it, can buy a product

---

## Conclusion

**The platform infrastructure is remarkable — ahead of roadmap in many areas.** The inline visual editor is a **differentiator** (lighter, higher fidelity than GrapesJS). But **without the commerce engine, there is no product to sell.**

**Recommendation**: Freeze all non-commerce work. 100% focus on `packages/server/src/domains/commerce/` + commerce catalog completion. Phase 0 completes when a real visitor can add to cart and checkout on an AI-generated storefront.

The commerce engine is the **only blocker** to proving the core value proposition: "Every visitor gets a storefront designed for them, powered by AI agents you manage, all in one open source server."