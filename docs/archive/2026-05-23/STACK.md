# Stack: Everything We Use In Our System

> **Updated 2026-07-25.** Auth: **ZITADEL** (see `docs/2026-07-13/AUTH.md`).

## Platform Identity: Agnostic

**The platform is identity-agnostic — it can power ANY use case.** Commerce is the first vertical, not the only vertical.

> **Framing:** "Commerce" here is only an *example vertical* used to make the general architecture concrete. The engines, domains, and data model are general-purpose and apply equally to booking, membership, SaaS, content, and any other use case.


The same architecture (json-render + XState + Content API + Nango + ClickHouse + Redis) can power:

| Use case | What changes | What stays the same |
|----------|-------------|---------------------|
| **Commerce** (first) | Component catalog: ProductCard, AddToCart, Checkout. Machines: booking, checkout, refund. Content types: product, variant, order. | Everything else — UI engine, state machine engine, Nango integrations, ClickHouse analytics, ZITADEL auth, Redis queues. |
| **Booking** | Component catalog: Calendar, TimeSlotPicker, ConfirmationCard. Machines: booking, reschedule, cancel. Content types: coach, availability, appointment. | Same engine. Different catalog + machines. |
| **Membership** | Component catalog: PricingTable, ContentGate, SubscriptionCard. Machines: signup, upgrade, cancel. Content types: tier, subscriber, access. | Same engine. Different catalog + machines. |
| **Content platform** | Component catalog: ArticleCard, RichText, VideoPlayer. Content types: post, category, author. | Same engine. Different catalog + content types. |
| **SaaS portal** | Component catalog: Dashboard, MetricCard, SettingsForm. Machines: trial, activate, downgrade. Content types: plan, usage, invoice. | Same engine. Different catalog + machines. |

**Commerce is the first driving vertical** — it validates the full stack (payments, state machines, content types) in production. But the platform is designed generically from day one. Any future vertical uses the same architecture, the same codebase, the same deployment.

---
## Complete Reference of Every Technology Component

| Component | What it does | Why we chose it | License | Self-host? | Phase |
|-----------|-------------|-----------------|---------|-----------|-------|
| **Postgres** | Content storage (JSONB) + Commerce storage (relational ACID) | One DB for both flexible content AND strict relational transactions. JSONB for products/pages/machines. Relational for orders/payments/inventory. | Open source | ✅ Docker | 0 |
| **ClickHouse** | Analytics events storage (columnar time-series) | 100x faster than Postgres for event aggregation queries. 5-10x compression vs Postgres. Built from day one - not migrated later. | Apache 2.0 | ✅ Docker | 0 |
| **Redis** | BullMQ job queues + cart + sessions + rate limiting | BullMQ requires Redis. Once running, we also use it for cart (TTL), session cache, and rate limiting counters. | Open source | ✅ Docker | 0 |
| **ZITADEL** | Auth system - platform admins + store customers | Self-hosted. Pre-built sign-in UIs, admin console, MFA, multi-tenancy, OAuth connectors (800+). PII stays on our infra. | MPL-2.0 | ✅ Docker | 0 |
| **json-render core** | UI rendering engine - resolves dollar-state bindings, manages StateStore, SpecStream, Zod catalogs | Framework-agnostic. Works without Next.js. Use only core + react packages. | Apache 2.0 | npm package | 0 |
| **json-render react** | React components for json-render: Renderer, StateProvider, Registry | SSR via React 19 renderToPipeableStream() on any Node.js runtime. | Apache 2.0 | npm package | 0 |
| **Hono** | HTTP server framework for our API + edge workers | Edge-native. Runs on Cloudflare Workers, Deno, Bun, Node.js. Ultra-fast (13KB, 9x faster than Express). TypeScript-first. | MIT | npm package | 0 |
| **XState v5** | State machine library for any flow | 29.6k stars. Built-in: actors, parallel states, history, delays, guards, actions, invoke. JSON definitions = AI-generatable. | MIT | npm package | 0 |
| **BullMQ** | Job queue for async tasks (AI agents, analytics events, email, retries, Nango) | Redis-backed. Durable, retries, delays, dead-letter queue. Keeps async work off the request path. | MIT | npm package | 0 |
| **Drizzle ORM** | Type-safe database access + migrations | Compile-time SQL validation. Auto-completion in IDE. Same API for Postgres and SQLite. Zod-compatible schemas. | Apache 2.0 | npm package | 0 |
| **GrapesJS** | Visual drag-drop editor for merchants | 21k stars. Custom component system matches json-render catalog exactly. Outputs JSON that json-render renders. | MIT | npm package | 0 |
| **Cloudflare Workers** | Edge delivery - serve cached schemas in under 20ms | 300+ locations globally. Sub-50ms cold start. KV for segment-cached layouts. R2 for media storage. | - | ✅ Cloudflare | 0 |
| **Cloudflare R2** | Image + file storage for products, pages, media | Zero egress fees. Global CDN. No surprise bandwidth bills. | - | ✅ Cloudflare | 0 |
| **Cloudflare Stream** | Video hosting + transcoding for product videos, hero videos | Auto-transcodes to HLS. Adaptive bitrate. Built-in player. Thumbnails, captions. | - | ✅ Cloudflare | 0 |
| **Nango** | External API integration platform (800+ APIs) | Open source. Handles OAuth tokens, rate limiting, retries, sync, actions, webhooks. Same Postgres server, different database. | MIT | ✅ Docker | 2+ |
| **Mastra** | AI agent framework - tools, guardrails, memory, orchestration | TypeScript-native. Tool-based agent model. Three permission levels: auto, approval, denied. Memory window. | Open source | npm package | 1 |
 - order confirmations, shipping, receipts, password resets | 100/day free tier. React Email templates. json-render has built-in integration. BullMQ queued. | - | ✅ Cloud API | 0 |
| **Stripe** | Payment processing - checkout, subscriptions, invoicing, tax, fraud | PCI compliant. 40+ payment methods. Stripe Elements embeds in our json-render checkout UI. | - | ✅ Cloud API | 0 |
| **Typesense** | Product search - full-text, typo-tolerant, faceted filtering | Self-hosted or managed. Fast, typo-tolerant. Replaces Postgres full-text search when content exceeds 100k products. | Apache 2.0 | ✅ Docker | 2+ |
| **Stately Studio** | Visual state machine editor - design machines visually, export to JSON | AI can use Stately AI too. Machines designed visually, exported to XState JSON format. | - | ✅ Cloud (state.new) | 1 |
| **ZITADEL Admin Console** | Auth management UI - users, roles, organizations, MFA, audit logs | Pre-built. No auth UI to build. Customizable for our platform branding. | - | ✅ Built into ZITADEL | 0 |
| **Drizzle Studio** | Visual DB browser - browse tables, run queries, export data | Ships with Drizzle. Open in dev mode. Useful for debugging and ad-hoc queries. | Apache 2.0 | Built into Drizzle | 0 |
| **Expo** | Mobile app rendering - same json-render catalog renders on iOS + Android | json-render/react-native works with Expo. Same components, same JSON, same API. | MIT | npm package | 2+ |

## What Each Database Stores

| Database | Stores | Why here | Not in |
|----------|--------|----------|--------|
| **Postgres** | Products (JSONB), Pages (JSONB), Blog (JSONB), Content types (JSONB), Machine definitions (JSONB), Orders (relational), Payments (relational), Bookings (relational), Inventory (relational), User metadata, Store settings, Media metadata | ACID across JSONB + relational. One transaction for order + inventory. | Analytics events (those go to ClickHouse). |
| **ClickHouse** | Analytics events (schemaId, variantId, contextHash, eventType, timestamp, storeId), Conversion data, ML training data, Dashboard aggregations | Columnar. 100x faster than Postgres for aggregations. 5-10x compression. | Content (too expensive to store JSONB in columnar). Commerce (no row-level locks). |
| **Redis** | BullMQ queues (AI agent tasks, analytics events, email, Nango), Cart sessions (TTL-based), Rate limiting counters, State machine locks | In-memory. Fast TTL cleanup. Pub/sub support for real-time features. | Permanent data (use Postgres for that). |

## Local Development Mode

| Service | Production | Local dev (docker compose up) | Local dev (noname dev --db sqlite) |
|---------|-----------|------------------------------|-----------------------------------|
| Postgres | Required | ? Docker | ? Replaced by SQLite |
| ClickHouse | Required | ? Docker | ? Skipped (events to console) |
| Redis | Required | ? Docker | ? In-memory (ioredis mock) |
| ZITADEL | Required | ? Docker | ? Docker (needs Postgres) |
| Nango | Phase 2+ | Optional Docker | Skipped |
| Workers KV | Required | ? Wrangler dev | ? Wrangler dev |
| R2 | Required | ? Wrangler dev | ? Wrangler dev |

## Build vs. Infrastructure

| We BUILD (our code) | We BUY/INTEGRATE (existing tools) |
|-------------------|---------------------------------|
| AI generation pipeline (prompt -> JSON) | Stripe (payments, tax, fraud) |
| Context engine (signals -> segment) 
| XState wrapper (retries, persistence, compensations) | ZITADEL (auth, MFA, OAuth, tenants) |
| Analytics pipeline (event -> ClickHouse + dashboard) | Nango (external API integrations) |
| AI agent manager (Mastra + our tools) | Cloudflare (Workers, KV, R2, Stream) |
| Feature flags (native flag domain) |
| JSON-render catalog (components) | json-render core + react (rendering engine) |
| GrapesJS commerce traits (editor components) | GrapesJS (drag-drop engine) |
| Admin dashboard (json-render spec) | Drizzle ORM + Studio (DB tooling) |
| Content type builder (Zod type system) | BullMQ (job queues) |
| Plugin system (extensible catalog) | Mastra (AI agent framework) |
| CLI (init, dev, deploy, logs) | XState (state machine library) |
| | React 19 (SSR rendering) |
| | Hono (web framework) |
| | Postgres / ClickHouse / Redis (data storage) |




