# Build Plan: Phase 0 Implementation
## System Architecture & Build Strategy

> **Updated 2026-07-25.** Auth provider is **ZITADEL** (migrated from Logto, 2026-07-13). See `docs/2026-07-13/AUTH.md`.

---

## Core Principles

**Don't rebuild the internet. Reuse open source. Only build what differentiates.**

- 90% existing infrastructure. 10% differentiated AI.
**The platform is identity-agnostic. Commerce is the first example vertical, not the platform identity.**
The same stack (json-render + XState + Content API + Nango + ClickHouse + Redis) powers any use case — commerce, booking, membership, SaaS, content. Commerce proves the full stack in production (payments, state machines, content types with ACID requirements). Future verticals reuse the same codebase with different catalogs and machines.

> **Framing — "commerce" is an example vertical, not the product.** Throughout this document, commerce (carts, checkout, orders, products) illustrates the general architecture. The engines, domains, and data model are general-purpose and apply equally to booking, membership, SaaS, content, and any other use case.


- Start monolithic. Split only when metrics say to.
- Hono + Node.js everywhere â€” edge, server, client share TypeScript.
- json-render core for layout â€” NOT `@json-render/next` (no Next.js lock-in).
- json-render's `resolveElementProps()` + React 19 `renderToPipeableStream()` for SSR in any Node runtime.

---

## Architecture: Nine Domains (One Monolith)

Same server. Different concerns. Each domain has its own storage pattern, caching strategy, and performance characteristics.

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚          CORE SERVER (Hono + Node.js + Postgres + Redis)     â”‚
â”‚                                                                â”‚
â”‚  /api/spec/*        â”€â”€â”€ Layout Engine (templates, variants)    â”‚
â”‚  /api/content/*     â”€â”€â”€ Content CMS (products, pages, blog)    â”‚
â”‚  /api/commerce/*    â”€â”€â”€ Commerce (cart, checkout, orders) — example vertical, not a core domain      â”‚
â”‚  /api/analytics/*   â”€â”€â”€ Analytics (events, attribution, ML)    â”‚
â”‚  /api/agents/*      â”€â”€â”€ AI Agent Manager (tasks, LLM, review) â”‚
â”‚  /api/context/*     â”€â”€â”€ Segment resolution (signalsâ†’segment)   â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
         â”‚
         â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚          EDGE LAYER (Cloudflare Workers + KV + R2)           â”‚
â”‚                                                                â”‚
â”‚  GET /edge/cached-layout  â†’  Layout template per segment       â”‚
â”‚  GET /media/*             â†’  R2-served images                  â”‚
â”‚  POST /edge/personalize   â†’  Edge ML mutation                  â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
         â”‚
         â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚          RENDERER (json-render core + React 19 SSR)          â”‚
â”‚                                                                â”‚
â”‚  SSR at edge: resolveElementProps() â†’ renderToPipeableStream()â”‚
â”‚  Client hydrate: json-render <Renderer> + StateStore          â”‚
â”‚  Subsequent patches: json-render diffToPatches RFC 6902       â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### Domain 1: Spec System (Layout Engine)

**What it does**: Stores, versions, and delivers layout templates. AI generates templates, not per-page layouts.

| Aspect | Detail |
|--------|--------|
| **Templates, not pages** | ~10-15 templates per store (ProductPage, ContentPage, BlogIndex, CollectionPage, CartPage). Same template serves 1,000 products â€” only content fills in via $state bindings. |
| **Per-segment variants** | 3-5 variants per template (mobile-new-visitor, desktop-returning, instagram-traffic). |
| **Storage** | Postgres JSONB: schemaId, version, state, parentVersion, JSON document, timestamps. Edge cache in Workers KV. |
| **Generated when** | New segment appears. Underperforming (<60% baseline). Merchant requests. |
| **Size** | 3-8KB per template. Total per store: ~15 templates Ã— 4 variants Ã— 5KB â‰ˆ 300KB. Trivial. |
| **SSR integration** | NOT Next.js. We use `@json-render/core`'s `resolveElementProps()` to resolve $state bindings server-side, then React 19's `renderToPipeableStream()` for SSR. Framework-agnostic. |

### Domain 2: Content CMS (Content Types + Media)

**What it does**: Structured content that layout templates reference via $state bindings. Content types, media/video management, CDN delivery.

**Core principle**: Content gets its OWN spec system â€” same json-render catalog pattern but for content types, not layout components. Content types are defined as Zod schemas. AI can read, generate, and write structured content. Content editors get a type-based editor (like Contentful but simpler and use-case-native (commerce as first example)).

**Content type catalog** (examples):
```
Product:     title, price, image, description, specs (structured: weight, material, color...)
FAQ:         question, answer (schema.org ready)
Testimonial: authorName, authorPhoto, quote, rating, productId
SizeGuide:   region, measurements (table data)
Comparison:  productA, productB, specRows (side-by-side)
Media:       type (image/video), url, alt, dimensions, duration, transcript
```

| Aspect | Detail |
|--------|--------|
| **Structured content** | Each content type has a Zod schema. json-render's catalog-like system validates and resolves content fields. AI can generate structured content â€” not just prose. |
| **Rich text (body)** | Stored as structured JSON (editor.js blocks, similar to Contentful's rich text format). NOT raw HTML. json-render has rich text components. |
| **Products** | title, price, image, inventory, variants, description, specs (structured). Shopify API (Shopify mode) OR our Postgres tables (standalone mode). |
| **Pages** | title, slug, body (rich text JSON), SEO meta. |
| **Blog** | posts (title, slug, body, image, category, tags, author). |
| **Media management** | Upload images â†’ R2 CDN (optimized, multi-size). Upload video â†’ Cloudflare Stream (transcoded to HLS, MP4 fallback). Thumbnails, captions, poster images. Video player component in json-render catalog. |
| **CDN delivery** | Images via Cloudflare Image CDN (auto-format, resize, compress). Video via Cloudflare Stream CDN (adaptive bitrate, worldwide). No manual optimization needed. |
| **Layout separation** | Content NEVER lives in the JSON schema. Schema has `{ "$state": "/product/title" }` or `{ "$state": "/faq/0/question" }` â€” content comes from CMS at render time. |
| **Performance** | Content data cached in Workers KV (TTL 5min). Separate key space from layout templates ("content:" prefix). Indexed by slug + contentType for fast lookup. |
| **Source** | Shopify API (Shopify mode) OR our Postgres tables (standalone mode). Adapter pattern â€” same content API regardless of source. |
| **Admin UI** | Content type builder (define fields, Zod-validated). Entry editor (fill in content for each type). Media library (upload, tag, search). Video upload + transcoding status. |

### Domain 3: Analytics Store (ClickHouse - From Day One)

**What it does**: Tracks every visitor interaction in ClickHouse (not Postgres), attributes to schema ID + variant + context, feeds ML. Columnar time-series DB built from day one - never in Postgres.

| Aspect | Detail |
|--------|--------|
| **Event shape** | { storeId, schemaId, variantId, contextHash, eventType, timestamp, sessionId, meta } |
| **Storage** | ClickHouse (columnar, time-series optimized). 5-10x compression vs Postgres. Sub-millisecond aggregation queries. |
| **Write path** | Click -> API -> BullMQ queue -> ClickHouse (append-only, columnar) |
| **Read path** | ML queries aggregations directly in ClickHouse. Dashboard via ClickHouse SQL. 100x faster than Postgres for time-series aggregation. |
| **Performance** | Columnar storage ideal for: count events by schemaId, conversion funnel, time-series trends. Auto-TTL for data retention. |
| **Local dev** | Skip ClickHouse. Events log to console or SQLite. No extra Docker service needed. |
| **Content relationship** | Events reference schemaId + variantId - they do not store the full layout. Analytics is separate from content and layout storage. |

### Domain 4: Commerce Engine (example vertical)

**What it does**: Cart, checkout, orders, payments. Stripe handles liability.

| Aspect | Detail |
|--------|--------|
| **Cart** | Redis (ephemeral, fast, TTL 24h). |
| **Orders** | Postgres (ACID, relational, indexed by store+user). |
| **Payments** | Stripe webhooks â†’ update order status. Never touch PCI data. |
| **Shipping** | Shippo/EasyPost API for rates and labels. |
| **Checkout UI** | Stripe Elements embeded in json-render checkout template. Personalized per visitor. |

### Domain 5: AI Agent Manager

**What it does**: Merchant assigns tasks, AI executes, human reviews and approves.

| Aspect | Detail |
|--------|--------|
| **Task queue** | BullMQ (Redis-backed, durable). Merchant assigns task â†’ enqueues â†’ worker picks up â†’ LLM call â†’ result stored. |
| **Overflow** | Keeps requests off the request path. No blocking. No timeout. |
| **Storage** | Postgres: taskId, status, input prompt, AI output, diff against current layout, human decision. |
| **Edge** | Agents only run in core server. Edge workers never execute agent tasks. |

---

## Layout Strategy: Templates, Not Per-Page Layouts

**The fundamental insight**: A store with 1,000 products does NOT need 1,000 different JSON schemas. It needs ONE product page template that renders all 1,000 products with different content.

```
WRONG (expensive, unscalable):
  1,000 products â†’ 1,000 JSON schemas Ã— 5 segments = 5,000 AI generations
  âŒ Too many LLM calls. Too much storage. Unnecessary.

RIGHT (templates + content):
  15 TEMPLATES (per store)                    CONTENT (from CMS at render time)
  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”              â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
  â”‚ ProductPage (1 JSON)     â”‚              â”‚ Product A: yoga-mat        â”‚
  â”‚   $state: /product/title â”‚ â† fills â”€â”€  â”‚ Product B: yoga-block      â”‚
  â”‚   $state: /product/price â”‚   in â”€â”€â”€â”€   â”‚ Product C: yoga-strap      â”‚
  â”‚   $state: /product/image â”‚              â”‚ ... 1,000 products         â”‚
  â”‚ Mobile variant (different layout)       â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
  â”‚ Desktop variant (different layout)        CMS (Shopify or our DB)
  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

SCALE:
  Templates: ~15 per store
  Variants (per segment): ~4 per template = ~60 variant schemas per store
  Content entries: unlimited (products, pages, blog)
  Each template serves ANY number of content entries
  AI generates template + variant, NOT per-product layout
  json-render resolves $state bindings at SSR time with content from CMS
```

### When AI Generates vs. When It Reuses

```
LAYOUT EXISTS FOR THIS SEGMENT + TEMPLATE?
         â”‚
         â–¼ NO â†’ AI generates layout â†’ Store (Postgres) â†’ Cache (KV)
         â”‚
         â–¼ YES â†’ ML checks conversion rate vs. baseline
                  â”‚
                  â”‚ > 60% of baseline â†’ Keep serving. Don't regenerate.
                  â”‚                     "Good enough." Reuse stored layout.
                  â”‚
                  â”‚ < 60% of baseline â†’ AI generates new variant
                  â”‚                     A/B test. Winner published + cached.
                  â”‚
                  MERCHANT REQUEST â†’ "Optimize for mobile"
                                     â†’ AI generates â†’ Reviews â†’ Approves
                                     â†’ Published + cached
```

**Result**: 0-2 LLM calls per store per day (vs. 24-48 for "generate continuously"). 90-95% fewer. Cache hit rate stays above 90%.

---

## Rendering Strategy: Split Across Edge + Client (Not Server-Side)

**The API server (Hono) never runs React. No SSR. No JSX.** Rendering happens in two places:

1. **Edge Worker** (Cloudflare) — for SEO-critical pages: product pages, collections, landing pages, blog posts. Receives JSON spec + data from API server, renders to HTML via `@json-render/core` + React 19 `renderToPipeableStream()`, caches HTML in Workers KV.
2. **Client Bundle** (Browser) — for interactive pages: subsequent navigation, admin dashboard, cart, checkout. Receives JSON spec + $state data, renders React tree via json-render runtime.

json-render has `@json-render/next` for Next.js integration. **We don't use it.**

| json-render package | Where used | What it does |
|--------------------|-----------|-------------|
| `@json-render/core` | Edge Worker + Client bundle + API server | `resolveElementProps()` — resolves $state bindings. `diffToPatches()` — RFC 6902 patches. `defineCatalog()` — Zod-validated catalogs. |
| `@json-render/react` | Client bundle only | `<Renderer spec>`, `StateProvider`, `VisibilityProvider`, `ActionProvider` — renders JSON to React tree in browser. |
| `@json-render/next` | Not used anywhere | We avoid Next.js lock-in. |

**Our SEO prerender flow (Edge Worker)**:
```
Cloudflare Worker receives request for product page
  → Check Workers KV for cached HTML (key: {storeId}:{template}:{segment}:{slug})
  → Hit? Return cached HTML (<10ms)
  → Miss? Fetch JSON spec + product data from API server
  → Resolve $state bindings via @json-render/core resolveElementProps()
  → React 19 renderToPipeableStream(<Renderer spec={...} registry={catalog} />)
  → Stream HTML to browser (<50ms first byte)
  → Store HTML in Workers KV for next visitor in same segment
```

**Our client render flow (Browser)**:
```
Browser receives JSON spec + $state data
  → json-render runtime walks JSON tree
  → Resolves $state bindings, conditions, component lookups
  → Renders React tree in browser
  → Hydrates with interactivity (cart, forms, animations)
  → Subsequent page changes via SpecStream patches (~200 bytes)
```

No Next.js. No Vercel. The API server stays pure Hono + business logic. React only runs at the edge (for SEO prerender) and in the browser (for interactivity).

---

## Auth Strategy: Dual Flow (Platform + Store Customers)

**One ZITADEL instance. Two distinct auth flows.** ZITADEL handles both platform users (store owners logging into our admin) and store customers (buyers logging into stores). Pre-built sign-in UIs for both â€” we embed, we don't build.

### Two User Types

```
ZITADEL (self-hosted Docker, one service)
         â”‚
         â”œâ”€â”€ PLATFORM AUTH (Admin dashboard) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
         â”‚     Users: Store owners + our team
         â”‚     Login to: admin.yogastore.com
         â”‚     Sign-in: email/password + SSO (Google/GitHub)
         â”‚     MFA: Available (store owner can require it)
         â”‚     Session: Long-lived (admin sessions)
         â”‚     ZITADEL role: "admin" within their org
         â”‚     PII: email, name, billing info (our platform)
         â”‚
         â””â”€â”€ STORE AUTH (Storefront) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
               Users: Store customers (buyers)
               Login to: yogastore.com/account
               Sign-in: email/password + social + magic link
               MFA: Available (store owner decides per store)
               Session: Short-lived (browser session)
               ZITADEL role: "customer" within the store org
               PII: email, name, address, order history (store's data)
```

### ZITADEL Organizations = Each Store

Every store in our platform is a ZITADEL organization:

```
ZITADEL organization: "yogastore"
  â”œâ”€â”€ Admin role â†’ Store owner (can manage store, view analytics, hire agents)
  â”œâ”€â”€ Support role â†’ Our team (help desk, optional)
  â””â”€â”€ Customer role â†’ Buyers (view orders, save addresses, manage subscriptions)
```

Each organization has its own sign-in experience (branded per store for customers), separate user directory, and independent MFA/SSO configuration. Store owners configure their store's auth settings from the admin dashboard â€” no code changes.

### What We Build vs. What ZITADEL Provides

| Feature | Built by | Why |
|---------|----------|-----|
| Login pages (admin + store) | ZITADEL provides | Pre-built, customizable, embed in our UI |
| Register pages | ZITADEL provides | Type selection: admin vs customer |
| Password reset | ZITADEL provides | Email templates included |
| Social login (Google, Apple, GitHub) | ZITADEL provides | One-click connectors |
| Magic link passwordless | ZITADEL provides | For store customers |
| MFA (TOTP, SMS, authenticator) | ZITADEL provides | Configurable per org, per user type |
| Multi-tenancy (each store = org) | ZITADEL provides | Built-in organization model |
| Admin console (user management) | ZITADEL provides | Manage users, roles, audit logs |
| **Embed in our admin dashboard** | **We build** | json-render admin component wrapping ZITADEL's UI |
| **Embed in storefront** | **We build** | json-render login component wrapping ZITADEL's API |
| **Guest checkout** | **We build** | No auth needed â€” create account after purchase |

### MFA â€” Available for Everyone

No reason to limit MFA to admins. Store customers with subscriptions, stored payments, or high-value accounts benefit from MFA too. Store owners decide per store:
- Can require MFA for admin login
- Can require MFA for customer login (or make it optional)
- Can leave it off entirely (default)

### PII and Tenant Isolation

ZITADEL's organization model keeps PII isolated per store:
- Store owner's email/name â†’ in the platform organization (accessible to us)
- Store customer's email/name â†’ in the store's own organization (NOT accessible to us â€” we see only order data)
- Customer PII is the store's responsibility, not ours
- We never use customer data ourselves â€” store owners control it

---

## Event-Driven Pattern (Within Monolith)

Start monolithic. Use queues for async work. Extract services only when metrics demand it.

```
ANALYTICS (event-driven):
  Click in storefront â†’ API: POST /api/events/track â†’ BullMQ enqueue
  â†’ Worker validates event â†’ Writes to Postgres event_capture table
  â†’ Worker checks: should ML re-evaluate this layout?
  â†’ Yes? â†’ Enqueue "ml-check" job â†’ ML queries â†’ Generate insight if needed

CONTENT CHANGE (event-driven):
  Merchant edits product price â†’ API: PUT /api/products/:id â†’ DB update
  â†’ Emit "product:updated" event (in-memory, same process)
  â†’ Handlers: invalidate KV cache for this product
  â†’ Flag: does any active layout use this product? If yes â†’ flag for re-evaluation

  Merchant uploads video â†’ API: POST /api/media/video
  â†’ Enqueue "video:transcode" â†’ Cloudflare Stream transcodes (async)
  â†’ Webhook when ready â†’ Update media record with stream URL
  â†’ Invalidate KV cache for any templates using this media

AI AGENT (job queue):
  Merchant assigns task â†’ POST /api/agents/tasks â†’ BullMQ enqueue
  â†’ Worker picks up â†’ Calls LLM â†’ Generates variant â†’ Stores result
  â†’ Merchant sees "task complete" â†’ Reviews diff â†’ Approves/Rejects

ALL ASYNC. NONE BLOCKS THE REQUEST PATH. CACHE IS KING.
```

### When to Extract to Separate Services

| Condition | Extract what | To what |
|-----------|-------------|---------|
| >100M analytics events/day (ClickHouse scale limit) | Analytics Store | ClickHouse (time-series optimized) |
| >100 AI agent tasks/minute | AI Agent Manager | Dedicated process with separate LLM quota |
| >1,000 stores with 10k+ products each | Content CMS | Read replica for product queries |
| Global latency >100ms outside US/EU | Spec System | Region-specific Workers KV namespaces |
| AI generation queue grows unbounded | AI Generation | Separate worker process (auto-scale) |

Start monolith. The boundaries are clear â€” extraction is changing import paths and adding queue producers/consumers, not redesigning domain logic.

---

## State Machine Engine: Workflow Logic Layer

**The missing piece.** json-render handles the UI layer (rendering, $state, actions dispatch). But commerce workflows (booking, checkout, subscription, refund) need a **server-side state machine engine** that handles atomic transitions, guards, async side effects, and audit logging.

json-render has `ActionBinding` for dispatching action calls from UI to handler. But the STATE MACHINE itself lives on the server â€” we build it.

### How The State Machine Connects UI + Backend

```
json-render UI                          State Machine Engine (Server)
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€                         â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

Button click:                              
  {                                     Machine: "booking"
    action: "booking.selectSlot",        States:
    params: {                              pending_payment â†’ paid
      slotId: { $state: "/slotId" }         paid â†’ confirmed
    }                                        confirmed â†’ completed
  }                                         any â†’ cancelled
       â”‚                                    any â†’ refunded
       â–¼                                     
  Action handler calls API:                 Each transition:
  POST /api/machines/booking                1. Guard check (slot available?)
  Body: {                                   2. Row lock (SELECT FOR UPDATE)
    machine: "booking",                    3. Transition state (atomic UPDATE)
    transition: "selectSlot",             4. Side effects (BullMQ):
    params: { slotId: "slot-123" }          email, calendar, analytics
       â”‚                                  5. Audit log entry
       â–¼                                     storeId, machine, from, to,
  Response: {                                 actor, timestamp, params
    state: "pending_payment",
    bookingId: "b-456"                    â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  }                                       
       â”‚                                   
  onSuccess: {                            Analytics & Observability:
    set: {                                Every transition logged:
      "/booking/state": "pending_payment"  Who? (customer ID)
      "/booking/id": "b-456"              What? (transition + params)
    }                                      When? (timestamp + duration)
  }                                        Why? (guard result, error if any)
                                          Result? (success/failure)
       â”‚                                   
       â–¼                                 Dashboard views:
  Stripe Checkout form shows               Real-time booking flow
  (StripeElements component)               Failed transitions
                                           Average time per state
                                           Conversion funnel
                                           per booking flow type
```

### State Machine Definition Schema

Every commerce flow is defined as a state machine with typed states, transitions, guards, and side effects:

```typescript
// machines/booking.ts â€” defined once, used by UI + backend
export const bookingMachine = defineMachine({
  name: "booking",
  states: {
    pending_payment: {
      transitions: [
        { to: "paid", guard: "paymentReceived", effect: "sendConfirmation" },
        { to: "cancelled", guard: "slotExpired", effect: "releaseSlot" },
      ],
    },
    paid: {
      transitions: [
        { to: "confirmed", guard: "slotAvailable", effect: "lockSlot" },
        { to: "refunded", guard: "adminApproved", effect: "processRefund" },
      ],
    },
    confirmed: {
      transitions: [
        { to: "completed", guard: "sessionHappened" },
        { to: "cancelled", guard: "cancellationAllowed", effect: "releaseSlot" },
        { to: "rescheduled", guard: "slotAvailable", effect: "updateCalendar" },
      ],
    },
  },
});
```

### Analytics & Observability Built Into State Machine

| Metric | How | Where visible |
|--------|-----|---------------|
| **Funnel conversion** | Count of machines entering each state | Admin dashboard: "60% of bookings reach confirmed" |
| **Avg time per state** | Timestamp at each transition | "Avg 2min in pending_payment before payment" |
| **Failure rate** | Count of transitions that errored | "5% of payments fail â€” show Stripe error breakdown" |
| **Flow breakdown by segment** | segmentHash stored on machine context | "Mobile users abandon booking at 2x rate" |
| **Guard rejection reasons** | Guard result logged per transition | "7% of slots unavailable â€” peak time pattern" |
| **Audit trail** | Every transition logged immutably | "Customer booked. Then cancelled. Then rebooked." |
| **Side effect success rate** | Email delivery, calendar sync | "98% confirmation emails delivered" |

**Every state machine transition is automatically an analytics event** â€” stored in the same `event_capture` table as layout attribution events. Schema:

```typescript
events table:
  storeId, machine, transition, fromState, toState,
  actor(customerId), params (JSONB), guardResult,
  duration (from â†’ to ms), success, error (if any),
  sessionId, timestamp
```

This means:
- The analytics dashboard shows LIVE state machine health â€” not just page views but business flow success
- Failed bookings bubble up with full trace (who clicked, what slot, where Stripe failed, what guard prevented)
- ML can predict which flows are likely to fail (e.g., "bookings at 2pm on Monday fail 3x more often â€” suggest blocking that slot")

### The Full Stack (What Connects to What)

```
json-render UI
  â†’ dispatches action (on click, on watch trigger)
  â†’ handler calls POST /api/machines/:machine/:transition
  â†’ State Machine Engine executes:
    1. Load machine definition
    2. Check guard (condition, SQL query, API call)
    3. Lock row (SELECT FOR UPDATE on affected resource)
    4. Atomic transition (UPDATE state WHERE current_state = X)
    5. Log analytics event (who, what, when, result)
    6. Queue side effects (BullMQ: email, calendar, webhook)
    7. Return new state to UI
  â†’ json-render onSuccess: set state â†’ UI re-renders
```

### Built vs. Buy

| Component | json-render provides | We build |
|-----------|---------------------|----------|
| Action dispatch (UI â†’ handler) | âœ… `ActionBinding` | â€” |
| State machine definition | âŒ | âœ… `defineMachine()` |
| Atomic transitions + locks | âŒ | âœ… Postgres + row-level locks |
| Guards (pre-conditions) | âŒ | âœ… Custom guard functions |
| Side effects (async) | âŒ | âœ… BullMQ workflows |
| Analytics + audit logging | âŒ | âœ… Auto-logged per transition |
| Dashboard visibility | âŒ | âœ… Admin dashboard charts |
| AI agent integration | âŒ | âœ… ML can analyze failure patterns |

The state machine engine is the **glue between json-render UI and our commerce backend.** json-render handles the visual layer (render spec, dispatch action, react to state change). The state machine handles the logic layer (validate, lock, transition, emit). The analytics capture layer sits underneath (every transition is an event).

### XState + Nango: XState Orchestrates, Nango Handles The External

XState never calls external APIs directly. XState handles WHEN (the flow), Nango handles HOW (the integration). The machine definition stays pure JSON — no API keys, no URLs, no retry logic, no auth tokens.

`
XSTATE (JSON — orchestrates flow):    NANGO (handles external calls):
──────────────────────────────        ─────────────────────────────
""payment_pending"": {                  stripe.charges.create({...})
  entry: { type: ""chargeCard"" }       → OAuth, retries, rate limits
}                                     → Auth refresh, error handling

""awaitingShipment"": {                 shippo.shipments.track({...})
  invoke: { src: ""trackShipment"" }    → Carrier API integration
}                                     → Retry on failure

""onDone"": {                           quickbooks.invoice.create({...})
  type: ""syncToQuickBooks""            → Nango handles token refresh
}                                     → Rate limiting built in
`

| Responsibility | XState | Nango |
|---------------|--------|-------|
| When to call | ✅ Knows transition timing | ❌ Just executes when called |
| How to call (URL, method, body) | ❌ Never knows | ✅ Defines the integration |
| Auth (OAuth tokens, API keys) | ❌ Never stores | ✅ Manages, refreshes, scopes |
| Retries (backoff, retry count) | ❌ Not needed | ✅ Built-in per integration |
| Rate limits (throttling) | ❌ Not needed | ✅ Handles per-provider limits |
| Error handling | ✅ Knows which state to go to on error | ✅ Returns clean error to XState |

The machine is pure JSON (AI-generatable, Zod-validatable). Nango integrations are pure TypeScript (developer-written, tested). XState orchestrates the flow. Nango manages the external. One orchestrator, one integrator — both part of the same catalog system, both visible to AI, both validated before execution.

---


---

## Dual Format: JSX Layer On Top Of JSON

**JSON is for machines (AI, edge, cache, diff) â€” not humans.** Developers and merchants who want to edit directly should see readable JSX, not verbose JSON, while AI and edge keep working with JSON.

### The Two Layers

```
â”Œâ”€ JSX LAYER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  Human-writable. Clear structure. Familiar syntax.          â”‚
â”‚  Props are named attributes. Conditionals are natural.      â”‚
â”‚  Versionable in git.                                        â”‚
â”‚                                                              â”‚
â”‚  <ProductPage>                                                â”‚
â”‚    <Hero title={product.title} image={product.image} />      â”‚
â”‚    <ProductInfo {...product} />                               â”‚
â”‚    <AddToCart variant="sticky" />                             â”‚
â”‚    {user.isNew && <SocialProof />}                            â”‚
â”‚  </ProductPage>                                               â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                                â”‚ Compiles to
                                â–¼
â”Œâ”€ JSON LAYER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  AI-generated. Edge-cached. Validated before render.        â”‚
â”‚  Diffed via RFC 6902 patches (~200 bytes).                  â”‚
â”‚  2KB per template (not 50KB HTML).                          â”‚
â”‚                                                              â”‚
â”‚  { "type":"ProductPage", "children":[                        â”‚
â”‚    { "type":"Hero", "props":{                                â”‚
â”‚      "title":{"$state":"/product/title"},...} }, ...] }      â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### Who Uses Which

| User type | Edits | Format | How |
|-----------|-------|--------|-----|
| **Non-technical merchant** | Layout structure | Drag-drop (GrapesJS) | No JSX, no JSON |
| **Developer / agency** | Layout, content types, machines | **JSX** | Code in JSX â†’ compiler validates â†’ transforms to JSON |
| **AI agent** | Anything | **JSON** | JSON is safer to generate, no syntax errors, validates before compile |
| **Edge delivery** | Nothing | JSON | 2KB, cached per segment, diffed via patches |
| **json-render** | Nothing | JSON | Renders JSON to components |

### Same Pattern For All Definitions

```
Layout templates:   JSX â†’ JSON â†’ json-render renders
Content types:      JSX â†’ JSON â†’ CMS stores + validates
State machines:     JSX â†’ JSON â†’ XState wrapper executes
AI generates:       JSON only (faster, safer, no JSX compile needed)
```

### XState Clarification: We Wrap It, We Don't Rely On It Natively

**XState does NOT understand commerce or our JSON definitions natively.** XState is a general-purpose state machine library. It knows states, transitions, guards, and actors â€” it does NOT know about bookings, checkouts, content types, permissions, or our analytics pipeline.

We build a WRAPPER on top of XState:

```typescript
// Our engine.ts â”€â”€ wraps XState with commerce awareness
// XState handles the core: transitions, states, actions, guards
// Our wrapper handles the commerce layer:

export async function executeTransition(machineName, transition, context) {
  // 1. Load machine definition from DB (JSONB)
  const machineDef = await content.get("machine", machineName);
  
  // 2. Create XState machine from definition
  const xstateMachine = createMachine(machineDef);
  
  // 3. Our wrapper checks commerce-specific guards
  if (transition.guard === "slotAvailable") {
    const slot = await db.query("SELECT status FROM slots WHERE id = $1 FOR UPDATE", [context.slotId]);
    if (slot.status !== "available") throw new GuardError("Slot unavailable");
  }
  
  // 4. XState executes the transition
  const result = interpret(xstateMachine).start(context);
  result.send(transition.event);
  
  // 5. Our wrapper handles commerce-specific side effects
  if (transition.sideEffect === "sendEmail") {
    await bullmq.add("email", { to: context.email, template: "booking-confirmed" });
  }
  if (transition.sideEffect === "nangoSync") {
    await nango.trigger("syncToQuickBooks", { orderId: context.orderId });
  }
  
  // 6. Our wrapper logs to analytics
  await analytics.logTransition({ machineName, from, to: result.state.value, context });
  
  return { newState: result.state.value };
}
```

| Layer | What it handles | Code |
|-------|----------------|------|
| **XState** (MIT, 28k stars) | Core: states, transitions, guards, actors, async | npm package |
| **Our wrapper** (we build) | Commerce: load machine defs from DB, guard check (slot availability, payment), side effects (email, Nango), analytics logging | `src/machines/engine.ts` |
| **Machine definitions** (JSONB in DB) | Store-specific: booking flow, checkout flow, refund flow | Stored as JSON, loaded at runtime |

XState gives us the engine. We give XState the context. XState handles the abstraction (state transitions, actors, parallelism). Our wrapper handles the concrete (commerce data, integrations, permissions). The machine definitions in the DB are the configuration that connects them.

---

## AI Agent Architecture

**Agents manage the store. Humans stay in control.** Every agent action is either: auto-execute (read-only analysis), require approval (drafts), or permanently denied.

### Agent Tool Permissions (Built Into Mastra Agent Framework)

```
AGENT TOOL TABLE:
                      Can analyze?   Can generate?   Can publish?   Can delete?
Layout templates      âœ… Read-only    âœ… Draft         âŒ Approval    âŒ Denied
Content               âœ… Read-only    âœ… Draft         âŒ Approval    âŒ Denied
Content types         âŒ Denied       âœ… Draft         âŒ Approval    âŒ Denied
State machines        âŒ Denied       âœ… Draft         âŒ Approval    âŒ Denied
Analytics             âœ… Auto         âŒ Denied        âŒ Denied      âŒ Denied
Pricing               âŒ Denied       âŒ Denied        âŒ Denied      âŒ Denied
Orders                âœ… Read-only    âŒ Denied        âŒ Denied      âŒ Denied
PII (customer data)   âŒ Denied       âŒ Denied        âŒ Denied      âŒ Denied
Payments/refunds      âŒ Denied       âŒ Denied        âŒ Denied      âŒ Denied
A/B tests             âœ… Read-only    âœ… Draft         âŒ Approval    âŒ Denied
```

### How Agents Execute (Mastra Framework + Our Platform)

```typescript
// Agent definition â€” runs in our server, uses our LLM, respects our permissions
import { Agent, Tool } from "mastra";

export const storeAgent = new Agent({
  name: "Store Optimizer",
  systemPrompt: "You manage a site. Generate drafts. Never publish without approval. Never touch pricing, PII, payments, orders, or refunds.",

  tools: {
    generateLayout: new Tool({
      name: "generateLayout",
      description: "Generate a new layout template from description",
      execute: async (params) => layoutLLM.call(params),
    }),
    analyzeAnalytics: new Tool({
      name: "analyzeAnalytics",
      description: "Read analytics data and find optimization opportunities",
      execute: async (params) => queryDB(params),
      guard: "auto",  // â† auto-execute (read-only)
    }),
    publishLayout: new Tool({
      name: "publishLayout",
      description: "Publish a layout to the live store",
      execute: async (params) => publishToEdge(params),
      guard: "human_approval",  // â† requires merchant to review & approve
    }),
    changePricing: new Tool({
      name: "changePricing",
      description: "Modify product prices",
      execute: async () => null,
      guard: "denied",  // â† AI can NEVER do this
    }),
  },

  memory: {
    type: "working",
    window: "30 days",  // Agent remembers past conversations with this merchant
  },
});
```

### Token & Pricing Model

```
| Tier             | AI actions/month | Token cost       | Who pays for LLM |
|------------------|------------------|------------------|------------------|
| Free (self-host) | Unlimited        | User's own API   | User (OpenAI/Claude bill) |
| Starter ($99/mo) | 500 actions      | Included         | We cover         |
| Pro ($199/mo)    | 2,000 actions    | Included         | We cover         |
| Business ($499/mo)| 10,000 actions  | Included         | We cover         |
| Enterprise       | Custom model FT  | Custom pricing   | User pays fine-tuning |

* A/B test execution and ML feedback loop: FREE (no LLM call â€” just bandit algorithm)
* Analytics query: FREE (query against DB, not LLM)
* Layout generation: 1 action (covers: generate + validate + cache)
* Content write: 1 action per generated content piece
* State machine definition: 2 actions (generate + validate)
```

### Agent Integration With json-render

Agent output appears in the same approval workflow as any other change:

```
Agent generates layout draft â†’ Merchant sees in admin dashboard â†’
  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
  â”‚  Agent "Store Optimizer" completed:                â”‚
  â”‚                                                    â”‚
  â”‚  "I generated a mobile-optimized version of your   â”‚
  â”‚   product page. Mobile conversion is 40% lower     â”‚
  â”‚   than desktop. This variant adds sticky CTA and   â”‚
  â”‚   compressed images."                              â”‚
  â”‚                                                    â”‚
  â”‚  [View Diff] [Preview] [Approve] [Reject] [Modify] â”‚
  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

Same approval workflow as AI-generated layouts, content, and state machines.
One permission system. One review UI. json-render renders it.
```

### Mastra vs. Alternatives

| Platform | Language | Best for | Fit for us |
|----------|----------|----------|------------|
| **Mastra** | TypeScript | Agent + tool orchestration, guardrails, memory | âœ… TypeScript, open source, guards, same stack |
| Vercel AI SDK | TypeScript | Streaming AI in UI | âœ… json-render already uses it (UI-only) |
| CrewAI | Python | Multi-agent teams | âŒ Python, separate infra |
| AutoGen | Python | Complex agent workflows | âŒ Python, heavy |
| LangChain | Python/JS | General LLM wrappers | ðŸŸ¡ Mastra is cleaner for our case |

**Decision**: Mastra for agent orchestration (same TypeScript stack, guardrails, memory). `@json-render/core` for UI binding (actions dispatch, $state reactivity). Our Hono server for runtime.

---

## Observability: What We Need to See (Tool Decisions Later)

Not choosing tools yet. Just documenting what we must be able to observe.

### Phase 0: Minimum Visibility (Launch)

| What | How | Why |
|------|-----|-----|
| **Request logs** | Hono middleware â€” status, method, path, duration, IP | Debug errors, rate limiting, abuse detection |
| **Application errors** | Centralized error handler â€” caught + uncaught errors logged to Postgres errors table with stack trace | Fix production bugs. Stack trace, request context, store ID. |
| **Business analytics** | Our events table â€” schemaId + variantId + snippetHash + event type + timestamp | Attribution. Every conversion traceable to the exact schema that drove it. |
| **Edge performance** | Cloudflare dashboard â€” Worker latency, KV hit rate, cache status, error rate | CDN is our fastest path. Must know when it degrades. |
| **State machine health** | Transitions logged to events table â€” machine, from, to, guard result, duration, success/fail | Commerce flows must succeed. Failures tracked per transition type. |
| **LLM cost tracking** | Per-LLM-call log â€” model, tokens, duration, cost, action type | AI generates everything. Must not lose money on LLM costs. |

### Phase 1: Error Tracking + Alerting

| What | Why |
|------|-----|
| **Error aggregation** | Group similar errors (same stack trace, same route). Count frequency. Track first seen vs last seen. |
| **Alerting** | Notify us when error rate spikes above baseline. Notify when state machine transitions fail repeatedly. |

### Phase 2: Distributed Tracing

| What | Why |
|------|-----|
| **Trace across services** | Follow a single request through: json-render SSR â†’ state machine â†’ Nango â†’ Stripe â†’ DB. Debug latency and failure in multi-service paths. |
| **Performance budgets** | Alert when any path exceeds: edge >50ms, SSR >200ms, state machine transition >1s, Nango call >3s. |

### Phase 3: Metrics + Dashboards

| What | Why |
|------|-----|
| **Real-time metrics** | Active visitors, revenue today, conversion rate, A/B test results, agent task completion rate, ML model confidence. |
| **Custom dashboards** | Per-store dashboards showing the metrics each merchant cares about (revenue, orders, page speed, conversion). |

**No tool decisions locked in. Evaluate when Phase 1 starts.** The events table (Phase 0) captures everything anyway â€” we can always backfill into a tool later.

---

## Reuse Open Source (Maximum Leverage)

| Library | What it gives us | Stars | License |
|---------|-----------------|-------|---------|
| **json-render core** | $state resolution, diff/patches, SpecStream, validation. No Next.js dependency. | 15k+ | Apache 2.0 |
| **json-render react** | `<Renderer>`, registry, StateProvider. SSR via React 19 stream. | â€” | Apache 2.0 |
| **GrapesJS** | Drag-drop â†’ JSON. Extensible component system. | 21k+ | MIT |
| **Hono** | Edge-compatible HTTP server. Runs on Cloudflare Workers, Deno, Bun, Node. | 18k+ | MIT |
| **Zod** | Schema validation. TypeScript-first. json-render uses it for catalog validation. | 35k+ | MIT |
| **Stripe SDK** | Payments, tax, fraud, receipts, webhooks. | â€” | MIT |
| **ZITADEL Auth** | Auth, sessions, SSO, MFA, multi-tenancy. Self-hosted via Docker (same compose file). Pre-built sign-in UIs and admin console. MPL-2.0. Free, PII stays on our infra. | 12k+ | MPL-2.0 |
| **Cloudflare SDK** | Workers, R2, KV, D1, Queues. | â€” | MIT |
| **Drizzle / Prisma** | Type-safe database access. Migrations. | â€” | Apache 2.0 |
| **Bull / BullMQ** | Job queues for async tasks (AI generation, analytics, emails). | â€” | MIT |
| **Resend** | Transactional email API (order confirmations, receipts, shipping). 100/day free. React Email compatible. | â€” | MIT |
| **React Email** | Email templates in React components. json-render has `@json-render/react-email` integration. | â€” | MIT |
| **React 19** | `renderToPipeableStream()` for SSR. Works without Next.js. | â€” | MIT |

---

## Build vs. Buy Summary

| Layer | Decision | Rationale |
|-------|----------|-----------|
| **Rendering** | BUY (json-render core + react) | 15k stars, Apache 2.0, multi-platform. No Next.js lock-in. |
| **Visual editor** | BUY (GrapesJS) | 21k stars, MIT, JSON output. |
| **Payments** | BUY (Stripe) | PCI, fraud, 40+ methods, tax. |
| **Auth** | BUY (ZITADEL, open source) | Self-hosted via Docker (same compose). Pre-built sign-in UIs and admin console. Multi-tenancy, SSO, MFA built-in. PII stays on our infra. MPL-2.0. Free.
| **Hosting/CDN** | BUY (Cloudflare) | 300+ edge locations, zero egress. |
| **Shipping** | BUY (Shippo/EasyPost) | Carrier integrations done. |
| **AI models** | BUY (OpenAI/Claude) | Multi-provider. No training from scratch. |
| **Database** | BUY (Postgres/Redis/ClickHouse) | Postgres for content + commerce. ClickHouse for analytics. Redis for cart + queues. |
| **Commerce (Shopify)** | BUY (Shopify API) | For existing Shopify stores. Zero migration. |
| **Commerce (standalone)** | **BUILD** | Products, cart, checkout, orders â€” simple CRUD + Stripe. |
| **Context engine** | **BUILD** | Differentiation. Per-visitor personalization. |
| **AI generation pipeline** | **BUILD** | Core product. Prompt â†’ valid JSON. |
| **AI agent manager** | **BUILD** | Differentiation. Human-in-the-loop. |
| **ML feedback loop** | **BUILD** | Differentiation. Schema-level attribution. |
| **Analytics pipeline** | **BUILD** | Differentiation. Schema-attributed events. |
| **Admin dashboard** | **BUILD** | Merchant UI. Store management, analytics, agent tasks. |

---

## Phase 0: What To Build First (6 Weeks)

### Week 1-2: Foundation + Three-Layer Setup

| Task | Layer | What | Reuse |
|------|-------|------|-------|
| **API server scaffold** | API | Hono + Postgres + Redis. Pure API server. No React. No SSR. Clear routes per DDD domain (content, spec, commerce, agent, analytics, context, ai-pipeline, machines, edge, admin). | Hono, Postgres, Redis |
| **Auth setup** | API | ZITADEL via Docker Compose. Multi-tenancy, pre-built sign-in UIs, admin console. PII on our infra. | ZITADEL Docker image |
| **json-render core (API server)** | API | Import `@json-render/core` for spec validation (`defineCatalog()` with Zod), `diffToPatches()` for variant management. NOT `@json-render/react` — no rendering on API server. | @json-render/core |
| **Component catalog** | Client | Define commerce components (ProductCard, AddToCart, CartDrawer, CheckoutButton) as Zod-validated json-render catalog. Consumed by both edge worker and client bundle. | @json-render/core |
| **Cloudflare setup** | Edge + Client | Workers for SEO prerender. R2 for client bundle hosting + media storage. KV for prerendered HTML cache + JSON spec cache + content data cache. | Cloudflare SDK |
| **Edge SEO prerender** | Edge | Worker that receives JSON spec + data → renders to HTML via @json-render/core + React 19 `renderToPipeableStream()` → caches in KV. For product pages, collections, landing pages. | @json-render/core, React 19 |
| **Client bundle setup** | Client | Configure rspack to bundle json-render runtime + commerce catalog → deploy to R2. Immutable, versioned JS assets. | @json-render/react, React 19, rspack |
| **ClickHouse setup** | API | Analytics events table. Schema for schemaId + variantId + event type + timestamp + storeId. | ClickHouse SDK |
| **Stripe setup** | API | Stripe Connect + Elements + Tax + Webhooks for both modes. | Stripe SDK |
| **BullMQ setup** | API | Redis-backed job queues for async tasks (analytics, AI, email). | BullMQ |
| **GrapesJS integration** | Client | Drag-drop visual editor → valid JSON. Connected to json-render catalog. Embedded in client bundle or admin dashboard. | GrapesJS |
| **Email setup** | API | Resend API key + React Email templates (bundled separately from storefront). Transactional emails queued via BullMQ. | Resend SDK |

```
Docker Compose services:
  app:         Our Hono server
  postgres:    Main DB + ZITADEL DB (`app`, `zitadel`, `nango` via scripts/compose/init-dbs.sh)
  dragonfly:   BullMQ queues + Redis-compatible cache
  zitadel:     Auth (ghcr.io/zitadel/zitadel:latest, port 8080)
  clickhouse:  Columnar time-series DB for analytics events
  s3:          R2-compatible asset storage (local dev)
  jaeger:      OpenTelemetry tracing UI
```

**Decision**: One repo. One server. Clear domain boundaries in the code. NOT microservices.

### Week 2-4: Core Domains

| Task | Domain | Build vs. Reuse |
|------|--------|----------------|
| **Layout template tables** | Spec System | **BUILD** â€” schemaId, version, parent, state, JSON |
| **Content CMS tables** | Content | **BUILD** â€” products, pages, blog media tables |
| **Shopify adapter** | Content | Shopify Storefront API SDK |
| **Context engine** | Context | **BUILD** â€” headers â†’ device, referrer, location â†’ segment |
| **AI generation pipeline** | AI | **BUILD** â€” prompt â†’ valid json-render JSON template |
| **Schema validator** | Spec System | json-render Zod validation |
| **Cart + checkout** | Commerce | Stripe SDK + **custom UI** |
| **Order management** | Commerce | **BUILD** â€” status machine, webhooks |

### Week 4-6: AI + Analytics + Agent

| Task | Domain | Build vs. Reuse |
|------|--------|----------------|
| **Analytics event pipeline** | Analytics | **BUILD** â€” event capture via BullMQ, schemaId + variantId + contextHash |
| **Storefront SSR** | Render | `@json-render/core` + React 19 SSR + Hono |
| **Per-visitor template delivery** | Edge | **BUILD** â€” KV cache key by template + segment |
| **AI agent manager (v0)** | AI | **BUILD** â€” task queue, LLM execution, approval workflow |
| **ML feedback loop (v0)** | Analytics | **BUILD** â€” store events, query conversion, surface insight |
| **Admin dashboard** | UI | **BUILD** â€” React admin UI, store management, analytics charts |
| **Demo store** | Integration | End-to-end test |

---

## Speed Architecture

### Request Flow

```
VISITOR REQUEST (any URL, stays the same)
       â”‚
       â–¼
CLOUDFLARE EDGE (300+ locations)
       â”‚
       â”œâ”€â”€ Static assets (R2) â†’ Return instantly
       â”‚
       â”œâ”€â”€ Pre-rendered HTML (KV) â†’ Return in <10ms
       â”‚     Key: {storeId}:{templateId}:{segment}:{contentSlug}
       â”‚     Value: Full resolved HTML
       â”‚
       â””â”€â”€ Cache miss â†’ Core server SSR
             â”‚
             â–¼
        1. Fetch content from CMS (Edge KV or Shopify API)
        2. Select layout template (from Edge KV)
        3. Resolve $state bindings (resolveElementProps â€” 1-2ms)
        4. React 19 SSR (renderToPipeableStream â€” 10-20ms)
        5. Stream HTML to browser (<50ms first byte)
        6. Store resolved HTML in KV for next visitor
```

### Caching Strategy

| Cache level | What | TTL | Miss cost |
|------------|------|-----|-----------|
| **Workers KV** | Pre-rendered HTML per template + segment + content | Until content or template changes | SSR: <50ms |
| **Workers KV** | Layout template JSON per segment | 24h | AI generate: <500ms |
| **Workers KV** | Content type data (products, FAQ, testimonials) | 5 min | Shopify API or DB: 50-100ms |
| **Workers KV** | Media metadata (image URL, video stream URL, alt text) | 1 hour | DB lookup: <10ms |
| **Cloudflare Stream** | Video HLS playback | Per video (forever) | Upload + transcode: 1-10 min |
| **Cloudflare Image CDN** | Optimized images (auto-format, resize) | 1 year (immutable) | Upload + transform: <1s |
| **CDN (Cloudflare)** | Static assets (JS, CSS) | 1 year (immutable) | 0 (always cached) |
| **Browser** | Session schema | Session | 0 |

### Performance Budget

| Metric | Target | Path |
|--------|--------|------|
| Edge cache hit | **<10ms** | KV read â†’ return HTML |
| SSR cache miss | **<50ms** | KV template + KV content â†’ resolve â†’ React stream |
| AI generation (cold) | **<500ms** | LLM call â†’ validate â†’ store â†’ cache |
| JSON diff patch | **<5ms** | json-render `diffToPatches()` at edge |
| Lighthouse score | **85+** | Thin components, edge SSR, no bloat |

---

## Cost Model

| Component | Launch (1 store) | 10k stores / 10M visits |
|-----------|-----------------|------------------------|
| Cloudflare Workers | $0 (free) | $200-500/mo |
| Cloudflare R2 | $0 (free) | $50-200/mo |
| Workers KV | $0 (free) | $50-100/mo |
| Postgres | $15/mo | $200-500/mo |
| Redis + BullMQ | $0 (included with Postgres) | $50-150/mo |
| Stripe | 2.9% + $0.30/tx | Scales with revenue |
| OpenAI API | $50-200/mo (dev) | $2k-10k/mo (cached) |
| **Total** | **~$65-215/mo** | **~$2,550-11,450/mo** |

Revenue at 10k stores: 10,000 Ã— $99 avg = $990k/mo. Infra cost: ~1-3% of revenue.

---

## Key Files

```
noname-server/
â”œâ”€â”€ src/
â”‚   â”œâ”€â”€ index.ts                 # Hono entry point
â”‚   â”œâ”€â”€ server.ts                # Routes, middleware
â”‚   â”œâ”€â”€ engines/
â”‚   â”‚   â”œâ”€â”€ state-machine.ts     # XState wrapper (execute transitions, guards, side effects)
â”‚   â”‚   â”œâ”€â”€ content.ts           # JSONB + relational content CRUD (same API, different storage)
â”‚   â”‚   â””â”€â”€ analytics.ts         # Event pipeline (every transition, click, conversion logged)
â”‚   â”œâ”€â”€ db/
â”‚   â”‚   â”œâ”€â”€ schema/              # Drizzle schema per domain
â”‚   â”‚   â”‚   â”œâ”€â”€ spec.ts          # Layout templates, variants
â”‚   â”‚   â”‚   â”œâ”€â”€ content.ts       # Products, pages, blog, content types
â”‚   â”‚   â”‚   â”œâ”€â”€ media.ts         # Images, videos, transcoding status
â”‚   â”‚   â”‚   â”œâ”€â”€ commerce.ts      # Orders, carts (relational, ACID)
â”‚   â”‚   â”‚   â”œâ”€â”€ analytics.ts     # Event capture
â”‚   â”‚   â”‚   â”œâ”€â”€ machines.ts      # State machine definitions (JSONB)
â”‚   â”‚   â”‚   â””â”€â”€ agents.ts        # Agent tasks
â”‚   â”‚   â””â”€â”€ migrations/
â”‚   â”œâ”€â”€ api/
â”‚   â”‚   â”œâ”€â”€ spec.ts              # Layout CRUD, publish, version
â”‚   â”‚   â”œâ”€â”€ content.ts           # Content types CRUD (products, FAQ, testimonials, etc.)
â”‚   â”‚   â”œâ”€â”€ media.ts             # Image + video upload, transcoding, CDN URLs
â”‚   â”‚   â”œâ”€â”€ commerce.ts          # Cart, checkout, orders
â”‚   â”‚   â”œâ”€â”€ machines.ts          # State machine definitions + execution
â”‚   â”‚   â”œâ”€â”€ analytics.ts         # Event tracking (BullMQ)
â”‚   â”‚   â”œâ”€â”€ agents.ts            # Agent tasks (BullMQ)
â”‚   â”‚   â””â”€â”€ context.ts           # Segment resolution
â”‚   â”œâ”€â”€ content-types/
â”‚   â”‚   â”œâ”€â”€ catalog.ts           # Content type Zod schemas (product, faq, testimonial, etc.)
â”‚   â”‚   â”œâ”€â”€ validate.ts          # Content validation against types
â”‚   â”‚   â””â”€â”€ editor.ts            # Admin UI for content type editing
â”‚   â”œâ”€â”€ media/
â”‚   â”‚   â”œâ”€â”€ upload.ts            # Image upload â†’ R2, Video upload â†’ Cloudflare Stream
â”‚   â”‚   â”œâ”€â”€ transcode.ts         # Video transcoding webhook handler
â”‚   â”‚   â””â”€â”€ cdn.ts               # CDN URL generation (images: multiple sizes, video: HLS)
â”‚   â”œâ”€â”€ renderer/
â”‚   â”‚   â””â”€â”€ ssr.ts               # resolveElementProps + React 19 SSR stream
â”‚   â”œâ”€â”€ edge/
â”‚   â”‚   â””â”€â”€ worker.ts            # Cloudflare Worker: cache, serve, diff
â”‚   â”œâ”€â”€ ai/
â”‚   â”‚   â”œâ”€â”€ generate.ts          # LLM â†’ JSON template
â”‚   â”‚   â”œâ”€â”€ validate.ts          # Zod validation
â”‚   â”‚   â”œâ”€â”€ agents.ts            # Agent task execution
â”‚   â”‚   â””â”€â”€ machines.ts          # AI â†’ state machine definitions
â”‚   â”œâ”€â”€ machines/
â”‚   â”‚   â”œâ”€â”€ engine.ts            # XState wrapper (transitions, guards, locks, side effects)
â”‚   â”‚   â”œâ”€â”€ booking.ts           # Booking flow machine definition
â”‚   â”‚   â”œâ”€â”€ checkout.ts          # Checkout flow machine definition
â”‚   â”‚   â”œâ”€â”€ subscription.ts      # Subscription flow machine definition
â”‚   â”‚   â””â”€â”€ refund.ts            # Refund flow machine definition
â”‚   â”œâ”€â”€ adapters/
â”‚   â”‚   â”œâ”€â”€ shopify.ts           # Shopify Storefront API
â”‚   â”‚   â””â”€â”€ stripe.ts            # Stripe Connect + Elements
â”‚   â”œâ”€â”€ catalog/
â”‚   â”‚   â””â”€â”€ components.ts        # json-render commerce catalog (layout components)
â”‚   â””â”€â”€ admin/
â”‚       â”œâ”€â”€ dashboard.tsx         # Merchant UI
â”‚       â”œâ”€â”€ machine-editor.tsx    # State machine visual editor (GrapesJS-like)
â”‚       â””â”€â”€ type-builder.tsx      # Content type builder UI
```

**One repo. One server. Three engines (state machine, content, analytics). Storage adapts per content type (JSONB or relational). AI generates layouts, content types, and state machine definitions. The same API serves all of it. Full stack general-purpose platform â€” like building a generic Supabase-like platform on top of open source components.**
---

## Developer Experience: CLI, Local Dev, Errors, SQL Tools

**DX from day 1.** The platform provides a CLI for local development, self-host, error debugging, and AI-readable logging. The same tools work for platform developers and for users building on the platform.

### CLI (
oname)

A single CLI command handles everything. Modeled after Supabase, Vercel, and Rails conventions.

| Command | What it does | Phase |
|---------|-------------|-------|
| 
oname init | Scaffold a new project. Creates directory, config, Docker Compose files. | Phase 0 |
| 
oname dev | Start local dev server + DB + ZITADEL + Redis. Hot reload. | Phase 0 |
| 
oname deploy | Deploy functions to edge/server/client. | Phase 1 |
| 
oname logs | Tail logs. Filter by error, warn, info. Structured JSON output. | Phase 0 |
| 
oname errors | Show recent errors with stack traces, context, timestamps. AI-readable format. | Phase 0 |
| 
oname db:migrate | Run Drizzle migrations. Both JSONB and relational schemas. | Phase 0 |
| 
oname db:studio | Open Drizzle Studio (visual DB browser + SQL editor). | Phase 0 |
| 
oname status | Check all service health (DB, Redis, ZITADEL, Edge). | Phase 0 |
| 
oname machine:simulate | Test a state machine locally. Step through transitions with mock data. | Phase 2 |

### Error Handling (AI-Readable From Day 1)

Every error in the system is captured with structured context — not just a stack trace. AI agents read the same format.

`json
// Logged error — machine-readable, AI-friendly
{
  "id": "err_abc123",
  "timestamp": "2026-05-26T19:00:00Z",
  "level": "error",
  "source": "state-machine",
  "machine": "booking",
  "transition": "PAY",
  "fromState": "pending",
  "context": {
    "bookingId": "b-456",
    "customerId": "cus-789",
    "amount": 49.99
  },
  "error": {
    "name": "GuardError",
    "message": "Slot not available",
    "cause": "slot-123 had status 'booked' when expected 'available'"
  },
  "stack": "..."
}
`

| CLI command | What it shows |
|-------------|--------------|
| 
oname errors | Recent errors, grouped by type. Count, first/last seen. |
| 
oname logs --level error --source state-machine | Filter by source. See: which machine, which transition failed. |
| 
oname logs --output json | ai-agent | Pipe to AI agent. Agent reads JSON, understands context, suggests fix. |

The error format is the same regardless of source — state machine failure, API error, Nango integration failure, edge worker timeout. AI agents can read, analyze, and suggest fixes for all of them.

### SQL Linting + DB Tooling

For the relational tables (orders, payments, bookings, inventory), developers and AI agents need SQL tooling.

| Tool | What it does | Phase |
|------|-------------|-------|
| **Drizzle ORM** | Type-safe SQL. Zod-compatible. Migrations. | Phase 0 |
| **Drizzle Studio** | Visual DB browser. Browse tables, run queries, see relations. | Phase 0 |
| **SQL lint via 
oname db:check** | Validate SQL for common errors (missing WHERE, injection, unindexed queries). | Phase 1 |
| **AI agent SQL access** | Agent can query orders/payments/analytics tables via safe read-only API. Guarded: never mutate. | Phase 1 |

### Local Development (Self-Host Ready)

`yaml
# docker-compose.yml — single command to start everything
services:
  app:         # Our Hono server (hot reload)
  postgres:    # Main DB + ZITADEL DB (database `zitadel` on shared Postgres)
  dragonfly:   # BullMQ + Redis-compatible cache
  zitadel:     # Auth (self-hosted, console at :8080)
  clickhouse:  # Analytics
  s3:          # Asset storage emulator
  jaeger:      # Tracing
  nango:       # 800+ API integrations (optional, start on demand)

# Or for lightweight local dev:
noname dev --db sqlite   # SQLite instead of Postgres — no Docker needed
`

| Dev mode | Setup time | Use for |
|----------|-----------|---------|
| docker compose up | 2 minutes | Full stack, production-like |
| 
oname dev --db sqlite | 10 seconds | Quick prototyping, unit tests, offline dev |

The SQLite mode uses the same content API abstraction layer (Zod schemas, CRUD, validation) but stores in a local file. The same catalog, XState engine, json-render rendering all work without Docker. This makes getting started instant for developers and self-host users.

### Self-Host Experience (Day 1)

**One command to start full stack: docker compose up** (Postgres, Redis, ZITADEL, Nango, our server).  
**One command for lightweight dev: 
oname dev** (SQLite, in-memory, no Docker).  
**Errors logged with full context — AI can read them.**  
**CLI handles everything: init, dev, deploy, logs, errors, db, status.**

**One repo. One server. Three engines (state machine, content, analytics). Storage adapts per content type (JSONB or relational). AI generates layouts, content types, and state machine definitions. The same API serves all of it. Full stack general-purpose platform — like building a generic Supabase-like platform on top of open source components.**








