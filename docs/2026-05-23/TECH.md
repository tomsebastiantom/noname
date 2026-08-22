# Technical Architecture
## How The Open Source AI Platform Actually Works

---

> **Framing — "commerce" is an example vertical, not the product.** Throughout this document, "commerce" (storefronts, carts, checkout, orders, products) is used as a concrete illustration of what the platform powers. The platform is **identity-agnostic**: its engines, domains, and data model are general-purpose and apply equally to booking, membership, SaaS, content, and any other use case. Commerce is the first vertical we validate against — not the platform's identity.


## Architecture Philosophy

**Split architecture: Hono API server + Edge rendering + Client bundle. JSON through json-render. AI agents you manage. Edge-delivered per visitor.**

The platform is three independent layers with clear contracts:

1. **API Server (Hono)** — pure API. No React. No SSR. Handles CMS, commerce, agents, analytics, context, AI pipeline. All business logic, all domain events.
2. **Edge Rendering (Cloudflare Worker)** — receives JSON spec + product data → renders to HTML for SEO-critical pages (product pages, collections, landing pages). Caches result. Client gets JSON for subsequent interactions via SpecStream patches.
3. **Client Bundle (json-render runtime + commerce catalog)** — static JS shipped from Cloudflare R2. Hydrates interactive pages from JSON specs. Handles cart, forms, animations, tracking events.

This is NOT a Next.js app. It's NOT an SSR monolith. It's three independent deployable units connected by JSON contracts — modeled after how Shopify (Oxygen storefront vs Core API), Amazon (rendering farm vs microservices), and Facebook Marketplace (GraphQL API vs Edge React SSR) actually operate at scale.

---

## System Overview

```
                    ┌──────────────────────────────────────────┐
                    │              VISITOR                      │
                    │  (Browser / Mobile App / Kiosk / Smart TV │
                    └──────────┬──────────────────────┬────────┘
                               │ HTTP Request          │
                               │ (with context headers)│
                               ▼                       │
                    ┌─────────────────────────────┐     │
                    │       EDGE LAYER             │     │
                    │  (Cloudflare Workers)        │     │
                    │                              │     │
                    │  ┌────────┐  ┌────────────┐ │     │
                    │  │Prerend │  │JSON Cache  │ │     │
                    │  │HTML    │  │(by segment │ │     │
                    │  │Cache   │  │ hash)      │ │     │
                    │  └────────┘  └────────────┘ │     │
                    │                              │     │
                    │  Flow:                        │     │
                    │  1. SEO page? → Check HTML    │     │
                    │     prerender cache. Hit? →   │     │
                    │     Return HTML instantly.    │     │
                    │  2. JSON path? → Check JSON   │     │
                    │     cache by segment. Hit? →  │     │
                    │     Return JSON to client.    │     │
                    │  3. Miss? → Fetch JSON spec   │     │
                    │     + product data from API   │     │
                    │     server, edge-render to    │     │
                    │     HTML for SEO pages.       │     │
                    └──────────┬──────────┬─────────┘
                               │ JSON     │ Prerendered
                               │ spec     │ HTML
                               ▼          │
                    ┌───────────────────┐ │
                    │  CLIENT BUNDLE     │◄┘
                    │  (json-render      │
                    │   runtime +        │
                    │   commerce catalog)│
                    │                    │
                    │  Hydrates JSON →   │
                    │  React tree in     │
                    │  browser. Handles  │
                    │  cart, forms,      │
                    │  animations,       │
                    │  tracking.         │
                    │                    │
                    │  Subsequent page   │
                    │  changes via JSON  │
                    │  diff patches      │
                    │  (SpecStream,      │
                    │   ~200 bytes).     │
                    └───────────────────┘
                               │ API calls (cart, checkout, analytics)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  API SERVER (Hono + Node.js + Postgres + Redis)      │
│  Pure API. No React. No SSR. No JSX.                                 │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  AI AGENT MANAGER                                             │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────────────────┐ │  │
│  │  │ Task Queue │  │ Agent      │  │ Review & Approval      │ │  │
│  │  │ (user      │  │ Executor   │  │ (user reviews diff,    │ │  │
│  │  │  assigns)  │  │ (AI does   │  │  approves, rejects,   │ │  │
│  │  │            │  │  the work) │  │  or modifies)         │ │  │
│  │  └────────────┘  └────────────┘  └────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────┐│
│  │  CMS Engine    │  │  AI Generation │  │  Context Engine       ││
│  │                │  │  Pipeline      │  │                        ││
│  │  Pages,        │  │  ┌──────────┐  │  │  Ingests:             ││
│  │  products,     │  │  │ Layout   │  │  │  - User data          ││
│  │  media, blog   │  │  │ LLM      │  │  │  - Device caps        ││
│  │  (WordPress-   │  │  ├──────────┤  │  │  - Business state     ││
│  │   like admin)  │  │  │ Content  │  │  │  - Environment        ││
│  │                │  │  │ LLM      │  │  │  - Traffic source     ││
│  └────────────────┘  │  ├──────────┤  │  └────────────────────────┘│
│  ┌────────────────┐  │  │ Commerce │  │                             │
│  │  Commerce      │  │  │ LLM     │  │  ┌────────────────────────┐│
│  │  Engine        │  │  └──────────┘  │  │  A/B Testing & Bandit ││
│  │                │  │  Output:       │  │                        ││
│  │  Cart,         │  │  JSON schema  │  │  Generates variants,   ││
│  │  checkout,     │  │  per visitor  │  │  routes traffic,       ││
│  │  payments,     │  │  segment      │  │  promotes winners      ││
│  │  inventory,    │  └────────────────┘  └────────────────────────┘│
│  │  subscriptions │                                                │
│  └────────────────┘  ┌────────────────┐  ┌────────────────────────┐│
│                       │  Analytics &  │  │  ML Feedback Loop      ││
│                       │  Attribution  │  │                        ││
│                       │               │  │  Events → Feature     ││
│                       │  Schema-level │  │  Store → Retrain →    ││
│                       │  tracking     │  │  Better schemas        ││
│                       └────────────────┘  └────────────────────────┘│
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  DATA ABSTRACTION LAYER                                       │  │
│  │  ┌────────────────────────┐  ┌────────────────────────────┐  │  │
│  │  │ Shopify Adapter        │  │ Stripe Connect Adapter     │  │  │
│  │  │ (products, cart,       │  │ (standalone: products,     │  │  │
│  │  │  checkout, orders via  │  │  cart, checkout, payments  │  │  │
│  │  │  Storefront API)       │  │  via Stripe)               │  │  │
│  │  └────────────────────────┘  └────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────┘  │
└───────────────────────┬─────────────────────────────────────────────┘
                        │ JSON spec + content data
                        ▼
                ┌─────────────────────┐
                │  EDGE RENDERER      │
                │  (Cloudflare Worker)│
                │                     │
                │  For SEO-critical   │
                │  pages: receives    │
                │  JSON spec + data   │
                │  from API server,   │
                │  renders to HTML    │
                │  via json-render    │
                │  core + React 19    │
                │  stream, caches     │
                │  result in Workers  │
                │  KV.                │
                │                     │
                │  For interactive    │
                │  pages: passes JSON │
                │  directly to client│
                │  bundle.            │
                └─────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  json-render (Open Source, Vercel-backed)            │
│                                                                      │
│  Maps JSON nodes to components via a typed catalog:                 │
│                                                                      │
│  const catalog = defineCatalog(schema, {                             │
│    components: {                                                     │
│      ProductCard: { props: z.object({ ... }), description: "..." }, │
│      AddToCart: { ... },                                            │
│      CheckoutButton: { ... },                                       │
│      // ... all commerce components                                 │
│    }                                                                 │
│  });                                                                 │
│                                                                      │
│  Supports: React, Vue, Svelte, Solid, React Native,                 │
│            Remotion, React PDF, React Email                          │
└───────────────────────┬─────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  VISUAL CMS / BUILDER (Custom Inline Editor)        │
│                                                                      │
│  Click-to-edit on live storefront (`?edit=true`). Drag-drop canvas  │
│  with component palette, layer tree, props panel. Merchant edits    │
│  the exact page visitors see. Same URL, same components, same       │
│  catalog. Code-split editor chunk (~50KB) loaded only for admins.   │
│  **NOT GrapesJS** — custom implementation supersedes it for v1.     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Why JSON + json-render (Not Direct Code Generation)

This is the most important technical decision. Every alternative was considered:

| Concern | JSON + json-render | Direct code generation (JSX/React) |
|---------|-------------------|-----------------------------------|
| **AI reliability** | LLMs output valid JSON ~99.5% with good prompting. Schema-validatable before render. | LLMs generate valid JSX ~70-80%. Syntax errors, unbalanced tags, invalid imports — crashes the page. |
| **Safety / trust** | Validation layer catches bad output. Returns fallback schema. Never crashes. | Bad code = broken storefront. Merchant sees errors. Trust destroyed. |
| **Multi-platform** | Same JSON → React, Vue, Svelte, RN, Flutter, Email, PDF. AI writes once. | Must regenerate for each platform. More LLM calls, more cost, more hallucination risk. |
| **Edge caching** | 2-5KB JSON. Cacheable at CDN by segment hash. Diff patches ~200 bytes. | 20-50KB HTML. Hard to cache per visitor. No diff protocol possible. |
| **Visual editing** | JSON tree maps 1:1 to drag-drop UI. GrapesJS, Builder.io, etc. all consume JSON. | Needs AST parser to reverse-engineer rendered code back into editable form. Near-impossible for complex components. |
| **Versioning / rollback** | JSON is a document. Store it. Diff it. Rollback is pointing to an older version. | Needs git. Slow. Can't rollback a single page without reverting the whole deploy. |
| **Attribution** | Every JSON node has an ID. "Which variant caused this conversion?" — trivially answerable from the analytics event. | Requires manual instrumentation. Developers must add tracking IDs to every component. |
| **LLM cost** | Generate once per segment. Cache for all visitors in that segment. | Must generate per-request (or per-visitor, no segment caching). Higher cost. |

**The decision**: JSON through json-render is safer, cheaper, more reliable, and more extensible than direct code generation. The renderer is a commodity — json-render (14.9k stars, Apache 2.0, Vercel-backed) already provides it. We build the commerce components for its catalog.

---

## The JSON Schema: The Heart of Everything

Every UI is a JSON document. This is not HTML. It is a **semantic, typed description of intent** that json-render maps to components.

### Example: Product Page Schema

```json
{
  "schemaVersion": "1.0",
  "id": "pdp-yoga-mat-001",
  "meta": {
    "generatedBy": "layout-llm-v3.2",
    "contextHash": "a7f3c9",
    "variantId": "variant-b",
    "locale": "en-US",
    "sessionId": "sess_abc123"
  },
  "layout": {
    "type": "page",
    "children": [
      {
        "type": "hero",
        "props": {
          "variant": "product-focus",
          "image": { "src": "{{product.images[0]}}", "alt": "{{product.title}}" },
          "badge": "{{product.tags.includes('new') ? 'New Arrival' : null}}",
          "urgency": "{{product.inventory < 5 ? 'Only ' + product.inventory + ' left' : null}}"
        }
      },
      {
        "type": "product-info",
        "props": {
          "title": "{{product.title}}",
          "price": "{{product.price}}",
          "compareAt": "{{product.compareAtPrice}}",
          "reviews": { "count": "{{product.reviewCount}}", "avg": "{{product.reviewAvg}}" },
          "description": "{{product.aiDescription}}"
        }
      },
      {
        "type": "add-to-cart",
        "props": {
          "variant": "sticky-mobile",
          "cta": "Add to Cart — {{product.price}}",
          "enableApplePay": "{{context.device.supportsApplePay}}",
          "enableGooglePay": "{{context.device.supportsGooglePay}}"
        }
      },
      {
        "type": "social-proof",
        "props": {
          "variant": "ugc-carousel",
          "source": "instagram",
          "hashtags": ["{{product.brand}}", "{{product.category}}"]
        },
        "condition": "{{context.user.isNewVisitor && context.device.isMobile}}"
      },
      {
        "type": "related-products",
        "props": {
          "algorithm": "ml-bundle",
          "maxItems": 4,
          "title": "Complete Your Setup"
        },
        "condition": "{{context.user.hasPurchasedBefore}}"
      }
    ]
  },
  "styling": {
    "tokens": {
      "primary": "#FF6B35",
      "font": "Inter",
      "borderRadius": "12px"
    }
  },
  "tracking": {
    "schemaId": "pdp-yoga-mat-001",
    "variantId": "variant-b",
    "contextHash": "a7f3c9"
  }
}
```

### Key Design Decisions in the Schema

1. **`{{template expressions}}`**: Data bindings that resolve at render time. The JSON is a template; the renderer fills in product data, user context, etc. (Supported natively by json-render's `$template` directive).

2. **`condition` fields**: Components only render if the condition evaluates to true. This is how per-visitor adaptation works — the JSON contains all variants; the context determines which show.

3. **`tracking`**: Every schema carries its own identity. Analytics can attribute any click or conversion to this exact schema + variant + context.

4. **`styling.tokens`**: Reference brand design tokens. AI can suggest changes, but the brand system constrains the palette.

---

## The Context Engine: What Feeds the AI

The context engine gathers signals before the AI generates the schema.

### Signal Taxonomy

| Signal Category | Signals | Source | Updated |
|----------------|---------|--------|---------|
| **User Identity** | Persona, segment, loyalty tier | CDP / first-party data | Per session |
| **User Behavior** | Pages viewed, time on site, cart state | Client events | Real-time |
| **User History** | Past purchases, LTV, churn risk | Data warehouse | Daily batch |
| **Device** | Viewport, input mode, GPU, battery | Client headers + JS | Per request |
| **Accessibility** | Reduced motion, screen reader, contrast pref | Client headers | Per request |
| **Network** | Bandwidth, latency, connection type | Client headers | Per request |
| **Geography** | Country, region, city, timezone | IP + headers | Per request |
| **Business** | Inventory levels, active promos, margin goals | Product DB + rules | Near real-time |
| **Regulatory** | GDPR, CCPA, LGPD, age requirements | Geography → rules | Per request |
| **Traffic Source** | UTM params, referrer, campaign | URL + headers | Per request |
| **Time** | Time of day, day of week, season | Server clock | Per request |

### How Context Becomes a Schema

```
Context Signals
     │
     ▼
┌──────────────┐
│  Segment      │  Map signals → user segment
│  Classifier   │  (first-time-mobile, returning-VIP, B2B-buyer, etc.)
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Schema       │  Look up cached schema for this segment
│  Cache Lookup │  Hit? → Return cached JSON (fast path)
└──────┬───────┘  Miss? → Generate new schema (slow path)
       │
       ▼ (cache miss)
┌──────────────┐
│  AI Generation│  Generate JSON schema from:
│  Pipeline     │  - Brand rules + design system
│               │  - Product catalog data
│               │  - Context signals
│               │  - Business goals (maximize conversion? AOV? LTV?)
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Schema       │  Validate against brand rules,
│  Validator    │  accessibility, commerce constraints
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Edge Cache   │  Store schema keyed by segment hash
│  Write        │  Next visitor in same segment → cache hit
└──────────────┘
```

### Performance Targets

| Path | Latency | When |
|------|---------|------|
| **Cache hit (edge)** | <20ms | Same segment, cached schema exists |
| **Edge ML mutation** | <50ms | Cached schema + lightweight personalization (e.g., swap product, change CTA) |
| **Full generation** | <500ms | New segment, no cache; LLM generates fresh schema |
| **Client hydration** | <100ms | JSON → rendered UI on client (json-render incremental) |

90%+ of traffic should hit the cache path. Full generation is the cold-start path for new segments.

---

## The AI Agent Manager

This is the core differentiator from other AI commerce tools. The AI Agent Manager implements a **human-in-the-loop** architecture:

```
USER assigns task                    AI AGENT executes
       │                                    │
       ▼                                    ▼
┌──────────────────┐   ┌──────────────────────────────┐
│ "Optimize my PDP │   │ 1. Analyzes current PDP JSON  │
│  for mobile low  │   │ 2. Checks analytics: 40% drop │
│  conversion"     │   │    off above fold on mobile   │
└────────┬─────────┘   │ 3. Generates 3 variant JSONs │
         │             │ 4. Calculates expected impact  │
         │             └──────────┬───────────────────┘
         │                        │
         ▼                        ▼
┌──────────────────────────────────────────────────────┐
│              REVIEW & APPROVAL                        │
│                                                       │
│  Variant A: Sticky CTA, compressed images            │
│  Variant B: Simplified grid, trust badges            │
│  Variant C: Video autoplay, 1-tap checkout           │
│                                                       │
│  [View Diff] [Preview] [Modify] [Approve] [Reject]    │
└──────────────────────────────────────────────────────┘
```

**Key design decisions:**

1. **Never publish without approval**: AI agents can generate, analyze, and suggest — but never publish to the live store without human review.

2. **Task-based, not autonomous**: The user decides what to optimize. The agent does the work. The user decides whether to publish. The agent does not have agency to start its own tasks.

3. **Diff-first**: Every agent output is presented as a diff against the current live schema. The user sees exactly what would change.

4. **Approval modes**: Per-task approval (default), per-session approval (approve all agent outputs for the day), auto-approve within guardrails (opt-in, user sets boundaries: "don't change pricing, don't remove add-to-cart").

---

## The Data Abstraction Layer

The platform supports two modes via an adapter pattern:

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
│ Merchant keeps their     │  │ Independent of any platform. │
│ existing Shopify setup.  │  │ Full data ownership.         │
└──────────────────────────┘  └──────────────────────────────┘
```

The AI engine, context engine, and json-render frontend are identical in both modes. Only the data source changes.

---

## The json-render Integration (Not Building a Renderer)

We don't build a renderer. json-render (open source, Apache 2.0, Vercel-backed, 14.9k stars) handles JSON→component mapping. Our work is:

```
OUR CODEBASE:
  ├── src/server/            (Node.js/Postgres server)
  ├── src/commerce/          (Cart, checkout, payments, products)
  ├── src/cms/               (Pages, media, blog, admin UI)
  ├── src/agents/            (AI Agent Manager: task queue, executor, review)
  ├── src/context/           (Context engine: signals → segment)
  ├── src/ai/                (AI generation pipeline: LLM calls, prompting)
  ├── src/adapters/          (ShopifyAdapter, StripeConnectAdapter)
  ├── src/edge/              (Cloudflare Worker: cache, route, personalize)
  └── src/catalog/           (Commerce component definitions for json-render)
                                  │
                                  ▼
                        json-render (npm package)
                        @json-render/core, @json-render/react, etc.
```

### What we add to json-render's catalog

```typescript
// Our commerce component catalog
const commerceCatalog = {
  components: {
    ProductCard: {
      props: z.object({
        productId: z.string(),
        variant: z.enum(["default", "compact", "detailed"]),
        showPrice: z.boolean().default(true),
        showRating: z.boolean().default(true),
      }),
      description: "Display a product with image, title, price, and rating",
    },
    ProductGrid: {
      props: z.object({
        products: z.array(z.string()),
        columns: z.number().min(1).max(6),
        filterable: z.boolean().default(false),
      }),
      description: "Grid of product cards with optional filtering",
    },
    AddToCart: {
      props: z.object({
        variant: z.enum(["default", "sticky-mobile", "inline"]),
        cta: z.string(),
        enableApplePay: z.boolean().default(true),
        enableGooglePay: z.boolean().default(true),
      }),
      description: "Add to cart button with payment quick-actions",
    },
    CheckoutButton: {
      props: z.object({
        text: z.string().default("Checkout"),
        mode: z.enum(["checkout", "express"]),
      }),
      description: "Proceed to checkout button",
    },
    CartDrawer: {
      props: z.object({
        position: z.enum(["left", "right", "bottom"]).default("right"),
        showShipping: z.boolean().default(true),
      }),
      description: "Sliding cart drawer with item list and totals",
    },
    // ... all commerce components
  },
  actions: {
    addToCart: { description: "Add item to cart" },
    removeFromCart: { description: "Remove item from cart" },
    applyDiscount: { description: "Apply discount code" },
    createCheckout: { description: "Create checkout session" },
  },
};
```

---

## The Render Engine: JSON → Pixels (via json-render)

The renderer runs in two places — edge (for SEO pages) and client (for interactive pages). Both use the same json-render core. No React runs on the API server.

json-render maps:
```
JSON node type → Component from our catalog
JSON props     → Component props (validated via Zod)
JSON children  → Component children
JSON condition → Render guard (if/else)
JSON bindings  → Data resolution (via json-render's $template, $state, $cond)
```

### Two Rendering Paths

| Path | When | Where | Output |
|------|------|-------|--------|
| **SEO prerender** | Product pages, collections, landing pages, blog posts | Cloudflare Edge Worker | Full HTML stream (React 19 `renderToPipeableStream`) → cached in Workers KV |
| **Client render** | Interactive pages, subsequent navigation, admin dashboard | Browser (json-render runtime + commerce catalog) | React tree hydrated from JSON spec and $state data |

### SEO Prerender Path (Edge Worker)

```
Edge Worker receives request for product page
  → Check Workers KV for cached HTML (key: {storeId}:{template}:{segment}:{slug})
  → Hit? Return cached HTML (<10ms)
  → Miss? Fetch JSON spec + product data from API server
  → Resolve $state bindings via @json-render/core resolveElementProps()
  → React 19 renderToPipeableStream(<Renderer spec={...} registry={catalog} />)
  → Stream HTML to browser (<50ms first byte)
  → Store rendered HTML in Workers KV for next visitor in same segment
```

### Client Render Path (Browser)

```
Browser receives JSON spec + $state data (1st page from edge, subsequent as diff patches)
  → json-render walks the JSON tree
  → For each node:
     a. Resolve data bindings via json-render's expression engine
     b. Evaluate conditions (skip if false)
     c. Look up component in our commerce catalog
     d. Pass props to component
     e. Render children recursively
  → Hydrate with interactivity (cart, forms, animations)
  → Fire tracking events (schema ID, variant ID, context hash)
  → Subsequent page changes via SpecStream patches (~200 bytes)
```

The API server NEVER runs React. It serves JSON specs + content data. The edge worker runs React for SEO prerendering. The browser runs React for interactivity.

### Self-Healing UI

If a data source fails (e.g., reviews API is down), the component can:
1. Ask the AI layer for a graceful fallback JSON node
2. Example: reviews widget fails → AI swaps in a trust badge component
3. The visitor never sees a broken widget; they see a slightly different layout

---

## A/B Testing & ML Optimization

### How It Works

```
┌──────────────┐
│  Goal Set     │  Seller assigns AI agent:
│  (via AI      │  "Maximize add-to-cart rate on PDP"
│   agent)      │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  AI Agent     │  Generates 3-5 JSON variants:
│  Variant      │  Variant A: Image-first layout
│  Generator    │  Variant B: Social proof above fold
│               │  Variant C: Sticky CTA on mobile
│               │  → Presents to seller for review
│               │  → Seller approves → test starts
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Multi-Armed  │  Routes traffic across approved variants:
│  Bandit       │  - Week 1: 20% traffic each (explore)
│               │  - Week 2: 40% to winner, 15% each to rest
│               │  - Week 3: 70% to winner, 10% to challengers
│               │  - Continuous: Auto-promote, auto-deprecate
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Analytics    │  Every event tagged with:
│  Attribution  │  - schemaId + variantId + contextHash
│               │  - We know EXACTLY which JSON drove which conversion
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  ML Retrain   │  Feature store updated with:
│               │  - Which component arrangements convert
│               │  - For which user segments
│               │  - In which contexts
│               │  Model retrained → better initial schemas
└──────────────┘
```

### Key Difference vs. Traditional A/B Testing

| Traditional A/B | Our A/B |
|----------------|---------|
| Engineer codes 2 variants | Seller asks AI agent → AI generates N variants → Seller approves |
| 50/50 traffic split for weeks | Bandit optimizes in real-time |
| Winner requires manual deploy | Winner auto-promoted via JSON swap |
| Only tests content within fixed layout | Tests entire layout structure |
| Attribution is approximate | Exact: schema ID → event → conversion |
| One test at a time | Continuous: hundreds of micro-tests |

---

## Edge Delivery Architecture

### Why Edge Matters

If the AI generates a unique schema per visitor segment, and we want <50ms delivery, we cannot call an LLM on every request. The architecture has two delivery paths:

```
SEO PRERENDER PATH (product pages, collections, blog posts, landing pages):
─────────────────────
Edge Worker receives request
         │
         ├─── Check Workers KV for cached HTML (key: {storeId}:{template}:{segment}:{slug})
         │    
         ├── HIT → Return HTML (<10ms, fully rendered, SEO-ready)
         │
         └── MISS → Fetch JSON spec + product data from API server
                    → Resolve $state bindings
                    → React 19 renderToPipeableStream() (<50ms)
                    → Stream HTML to browser
                    → Cache HTML in Workers KV

CLIENT JSON PATH (interactive pages, subsequent navigation, admin dashboard):
─────────────────────
Edge Worker receives request
         │
         ├─── Check JSON cache by segment hash
         │
         ├── HIT → Return JSON to client (<20ms)
         │         Client bundle renders interactively
         │
         └── MISS → Fetch from API server
                    → Return JSON to client
                    → Client bundle renders

Cold Path (once per segment)          Hot Path (every request)
─────────────────────                 ─────────────────────
AI generates schema                   Edge Worker checks cache
         │                                       │
         ▼                                       │
Schema cached at edge              ┌────────────┴────────────┐
(keyed by segment hash)            │ Hit                     │ Miss
         │                          ▼                         ▼
         │                   Return cached           Fetch from API
         │                   JSON/HTML                server
         │                                              │
         └──────────────────────────────────────────────┘
                                 │
                                 ▼
                          JSON Diff to client
                          (only changed nodes)
```

### CDN Strategy

| Asset | Cache Location | Cache Key | TTL |
|-------|---------------|-----------|-----|
| Prerendered HTML (SEO pages) | Workers KV | `storeId + templateId + segment + contentSlug` | Until content or template changes |
| JSON schema (per segment) | Edge POP | `siteId + segmentHash` | 1 hour |
| Client bundle (json-render runtime + catalog) | Cloudflare R2 / CDN | `bundleHash` | 1 year (immutable) |
| Product data | Edge POP | `productId + locale` | 5 minutes |
| Media assets | Edge + Browser | `assetHash` | 1 year (immutable) |
| ML model weights | Edge Worker | `modelVersion` | 24 hours |
| User segment mapping | Edge Worker | `userId` | Session |

### JSON Diff Protocol (Built Into json-render)

When a schema changes, we do NOT send the full JSON again. json-render has built-in support for RFC 6902 JSON Patch — we reuse it, we don't build it.

**json-render provides**:
- `diffToPatches(oldObj, newObj)` — generates RFC 6902 patch operations from two objects
- `applySpecStreamPatch(obj, patch)` — applies a single patch
- `createSpecStreamCompiler<T>()` — streaming compiler for progressive patches
- `deepMergeSpec(base, patch)` — RFC 7396 deep merge

**How we use it**: API server calls `diffToPatches(oldSchema, newSchema)`, edge worker sends only the patch (~200 bytes), client applies via the SpecStream compiler. A "page change" is ~200 bytes instead of ~20KB.

---

## Data Layer & Analytics

### Schema Telemetry

Every JSON node carries a traceable ID. This solves the "black box" problem of AI-generated UI.

```
User clicks "Add to Cart"
         │
         ▼
Event: {
  type: "add_to_cart",
  schemaId: "pdp-yoga-mat-001",
  variantId: "variant-b",
  contextHash: "a7f3c9",
  componentPath: "/layout/children/2",
  timestamp: 1748000000,
  sessionId: "sess_abc123"
}
         │
         ▼
Analytics Warehouse (BigQuery / Snowflake)
         │
         ▼
We can answer: "Which JSON schema variant, for which user segment,
in which context, produced this conversion?"
         │
         ▼
ML Feature Store → Model Retrain → Better schemas next time
```

### Closed-Loop Feedback

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  UI Event │────▶│ Analytics│────▶│  Feature │────▶│  Model   │
│  (click,  │     │ Warehouse│     │  Store   │     │  Retrain │
│  convert) │     │          │     │          │     │          │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
                                                          │
                                                          ▼
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Better  │◀────│  Schema  │◀────│  AI Agent│◀────│  New    │
│  UX      │     │  Cache   │     │  Variant │     │  Weights│
│          │     │  Update  │     │  Gen.    │     │          │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
```

---

## Technology Stack

### Three-Layer Architecture

| Layer | What runs where | Technology |
|-------|----------------|-----------|
| **API Server** | Hono + Node.js on Docker (or Cloudflare Workers for edge compat) | Hono, Drizzle ORM, BullMQ, XState, Zod, Mastra |
| **Edge Renderer** | Cloudflare Workers (300+ global locations) | @json-render/core, React 19 (for SEO prerender only), Workers KV, R2 |
| **Client Bundle** | Browser (hydrated from JSON spec) | @json-render/core, @json-render/react, React 19, our commerce catalog |

### API Server Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| **Runtime** | Hono + Node.js (TypeScript) | Pure API server. No React. No SSR. Runs on Docker or Cloudflare Workers. |
| **ORM** | Drizzle ORM | Type-safe SQL. Zod-compatible schemas. Migrations. |
| **Database** | PostgreSQL | JSONB for content (products, pages, blog). Relational for ACID (orders, payments, bookings). |
| **Cache/Queues** | Redis (DragonflyDB) | BullMQ job queues. Cart sessions. Rate limiting. |
| **State Machines** | XState v5 | Commerce flows: booking, checkout, refund, subscription. Definitions stored as JSONB. |
| **Validation** | Zod | Catalog schemas, content type validation, API input validation. |
| **AI Agents** | Mastra | Agent orchestration. Tool-based with guardrails (auto/approval/denied). Memory window. |
| **Analytics** | ClickHouse | Columnar time-series. 100x faster than Postgres for event queries. Schema-level attribution. |
| **Integrations** | Nango (Phase 2+) | 800+ external APIs. OAuth, rate limiting, retries. |
| **Auth** | Logto (self-hosted Docker) | Dual flow: platform admins + store customers. Multi-tenancy. Pre-built UIs. |
| **Payments** | Stripe Connect + Elements | Standalone mode. Shopify Payments in Shopify mode. Never touch PCI data. |

### Edge & Client Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| **Schema Format** | json-render JSON spec | AI-generatable. Schema-validatable. ~2-5KB. Diff patches ~200 bytes. |
| **SEO Prerender** | @json-render/core + React 19 at edge | For product pages, collections, blog. Streams HTML, caches in Workers KV. |
| **Client Rendering** | @json-render/core + @json-render/react + React 19 | Hydrates JSON specs to interactive React trees in browser. |
| **Client Bundle Hosting** | Cloudflare R2 + CDN | Immutable JS bundle. Global delivery. Zero egress fees. |
| **Visual Editor** | Custom inline editor (packages/client/src/editor/) | Click-to-edit on live storefront. Drag-drop canvas, component palette, layer tree, props panel. Code-split (~50KB). Loaded only for admins via `?edit=true`. Replaces GrapesJS for v1. |
| **Edge Caching** | Cloudflare Workers KV | Prerendered HTML (SEO pages) + JSON specs (per segment) + content data. |
| **Media** | Cloudflare R2 + Image CDN + Stream | Images: auto-format, resize. Video: HLS transcoding, adaptive bitrate. Zero egress. |
| **AI Models** | OpenAI / Claude / fine-tuned | Multi-provider. Different models for layout vs content vs analysis. Abstracted LLM layer. |

---

## Auth Architecture: Edge Validation + Separate Auth Service

Logto is the auth service (self-hosted Docker). The Hono API server never handles passwords, OAuth flows, session management, or MFA. It only validates JWTs that Logto already issued.

### Two-Tenant Model

```
LOGTO (one Docker service)
  │
  ├── Org: "store-123" (platform tenant — our customer)
  │     ├── Role: admin → Store owner (login to admin dashboard)
  │     └── Role: support → Our team
  │
  └── Org: "store-123-customers" (store tenant — buyers, followers)
        ├── Role: customer → Store buyers (login to storefront)
        └── Login: email/password, Google/Apple OAuth, magic link
```

Each influencer/store gets one Logto organization. Their followers authenticate against it. Platform admins authenticate against their own org.

### Edge JWT Validation (Cloudflare Worker)

JWT validation happens at the infrastructure layer — the Cloudflare Worker — not in the API server. Pattern modeled after Shopify (Accounts service vs Storefront API) and Amazon (Cognito vs Retail API).

```
Visitor requests /checkout (protected page)
         │
         ▼
┌────────────────────────────────────────────┐
│  CLOUDFLARE WORKER (edge middleware)        │
│                                             │
│  1. Read JWT from cookie/Authorization      │
│  2. Validate signature against Logto JWKS   │
│  3. Check expiry                             │
│                                             │
│  VALID?                                     │
│    → Extract tenantId, userId, role         │
│    → Attach to forwarded request headers    │
│    → Pass to API server / KV cache          │
│                                             │
│  INVALID / MISSING?                         │
│    → HTTP 302 Redirect to:                  │
│      https://auth.store.com/sign-in        │
│      ?redirect_uri=/checkout               │
│      (Logto's pre-built branded login page) │
└────────────────────────────────────────────┘
         │ (if valid)
         ▼
┌────────────────────────────────────────────┐
│  HONO API SERVER                            │
│                                             │
│  Request has validated tenantId, userId,    │
│  role in context. No auth logic needed.     │
│  Proceed with business logic.               │
└────────────────────────────────────────────┘
```

### Login Flow

1. Visitor hits protected page → Edge Worker sees no JWT → 302 redirect to Logto login
2. Logto shows branded login screen (email/password, Google OAuth, magic link)
3. Visitor authenticates → Logto issues JWT + sets session cookie
4. Logto redirects back to `?redirect_uri` (original page)
5. Now JWT valid → Edge Worker passes request through → visitor sees content

### Why Edge Validation (Not Server-Side)

| Approach | Latency (invalid request) | Server CPU cost | Failure mode |
|----------|--------------------------|-----------------|--------------|
| **Edge Worker validates** | <5ms (redirect to Logto) | Zero (rejected at edge) | Edge-only failure → fallback to Hono middleware |
| **Hono server validates** | 100-200ms (round-trip to origin) | CPU spent on every rejected request | Server crash affects auth too |

Edge validation stops invalid requests before they travel to the origin server. The API server only sees requests with valid JWTs — it can focus on business logic.

### Hono Fallback Middleware

For internal API calls (webhooks, service-to-service), Hono has a JWT validation middleware as fallback:

```typescript
// Lightweight — validates JWT, doesn't manage auth
import { jwtVerify } from "jose";

async function authMiddleware(c, next) {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return c.json({ error: "unauthorized" }, 401);
  try {
    const { payload } = await jwtVerify(token, getLogtoJWKS());
    c.set("tenantId", payload.organization_id);
    c.set("userId", payload.sub);
    c.set("role", payload.role);
    await next();
  } catch {
    return c.json({ error: "invalid token" }, 401);
  }
}
```

### PII Isolation

| Data | Where it lives | Who can access |
|------|---------------|----------------|
| User emails, passwords, OAuth tokens | Logto's Postgres (separate DB) | Only Logto. Never our API server. |
| Store names, product data, order history | Our Postgres (app database) | Our API server. Referenced by tenantId, not user email. |
| Customer addresses, payment methods | Our Postgres OR Stripe (PCI) | Referenced by userId (UUID), not by email. |

---

## Security & Compliance

| Concern | Approach |
|---------|----------|
| **Data isolation** | Each tenant's schemas, products, and user data in separate DB schemas or encrypted partitions |
| **AI output safety** | All AI-generated JSON validated against strict json-render catalog schema before rendering. Bad JSON is rejected, not rendered. |
| **PII handling** | Context engine uses hashed IDs; raw PII never leaves the tenant's database |
| **GDPR / CCPA** | Per-region schema generation includes compliance components; data export API for users |
| **Payment security** | Stripe handles all PCI; we never see raw card numbers |
| **Rate limiting** | Edge workers enforce per-IP and per-session rate limits |
| **Content moderation** | AI-generated content scanned for policy violations before publish |
| **Human approval gate** | No AI-generated content reaches the live store without seller approval (configurable per agent) |

---

## API Overview

### Core Endpoints

```
# CMS
GET    /api/pages                  # List content pages
POST   /api/pages                  # Create page
GET    /api/pages/{id}             # Get page (returns JSON schema)
PUT    /api/pages/{id}             # Update page

# Commerce
GET    /api/products               # List products
POST   /api/products               # Create product
GET    /api/products/{id}          # Get product
POST   /api/cart/add               # Add to cart
POST   /api/checkout/create        # Create checkout session

# AI Agents
POST   /api/agents/tasks           # Assign task to AI agent
GET    /api/agents/tasks/{id}      # Get task result
POST   /api/agents/tasks/{id}/approve   # Approve agent output
POST   /api/agents/tasks/{id}/reject    # Reject agent output

# Context
POST   /api/context/resolve        # Resolve context signals for current visitor
GET    /api/context/segments       # List known user segments

# Analytics
POST   /api/events/track           # Track UI event with schema attribution
GET    /api/analytics/conversion   # Conversion data by schema variant

# A/B Testing
POST   /api/experiments/create     # Create experiment with goal + variants
GET    /api/experiments/{id}/results # Get experiment results

# Edge
GET    /api/edge/schema/{siteId}   # Edge worker fetches cached schema
POST   /api/edge/personalize       # Edge ML mutation for current visitor
```

---

## Key Technical Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **LLM latency** | Slow schema generation = bad UX | 90%+ cache hit rate; full generation only for new segments |
| **AI hallucination in generated UI** | Bad layouts, wrong content, legal liability | JSON validated against typed catalog schema (via json-render's Zod validation). Human approval gate before publish. |
| **json-render dependency** | Upstream changes could break | Locked version in package.json. We can fork if needed (Apache 2.0). |
| **Shopify API changes** | Shopify mode could break | Abstracted behind adapter. Shopify mode is one of two paths — standalone mode unaffected. |
| **Edge worker limits** | Cloudflare Workers have CPU/time limits | Lightweight models only at edge; heavy generation in core server |
| **Schema versioning** | Multiple versions in flight simultaneously | Every schema is immutable; changes create new versions; rollback = point to old version |
| **ML cold start** | New stores have no data for personalization | Transfer learning from similar stores on the platform |
| **Vendor lock-in on AI models** | Dependency on OpenAI/Claude | Abstracted AI layer; can swap models; fine-tuned open models as fallback |


