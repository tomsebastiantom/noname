# Findings & Key Insights

> **Updated 2026-07-25.** Auth provider is **ZITADEL** (migrated from Logto, 2026-07-13). See `docs/2026-07-13/AUTH.md`.

## Everything We Learned, Decided, and Corrected

---

## The Product (Final)

**An open source, AI-manageable platform â€” JSON-powered storefront, state machine engine, Nango integrations, AI agents you control, all in one server.**

AI generates layouts, content types, and state machine definitions. json-render renders the UI. XState orchestrates workflows (commerce as the first example). Nango connects external systems. The same JSON model powers UI, state, integrations, and analytics.

> **Framing — "commerce" is an example vertical, not the product.** This document uses commerce as a concrete illustration. The platform is **identity-agnostic**: the same engines and domains power booking, membership, SaaS, content, and any other use case. Commerce is the first vertical we validate against, not the platform's identity.

---

## Architecture: Three Engines, One Platform

```
json-render (UI) â†’ State Machine Engine (logic) â†’ Nango (integrations) â†’ Content API (storage)
        â”‚                    â”‚                           â”‚
        â”‚                    â”‚   Guards, locks,           â”‚  800+ APIs
        â”‚  $state, actions,  â”‚   transitions, side        â”‚  auth, retries,
        â”‚  watchers,         â”‚   effects, audit log       â”‚  sync, webhooks
        â”‚  SpecStream,       â”‚                            â”‚
        â”‚  SSR               â”‚                            â”‚
        â–¼                    â–¼                            â–¼
                        ANALYTICS ENGINE
                Every transition, click, conversion logged
                schemaId + variantId + contextHash
```

| Engine | What it does | Open source | Storage |
|--------|-------------|-------------|---------|
| **json-render** | UI rendering, $state, actions dispatch, SpecStream, SSR | Apache 2.0 | JSON specs in Workers KV |
| **State Machine** | Commerce flow orchestration, guards, locks, atomic transitions, side effects | MIT (XState) | Machine definitions in JSONB, execution in code |
| **Content API** | CRUD for all content types (products, pages, blog, bookings, orders, machines) | Postgres | **JSONB** for read-heavy (products, pages). **Relational** for ACID (orders, payments, bookings). |
| **Analytics** | Every event captured with full attribution | **ClickHouse** | Columnar time-series DB. 100x faster than Postgres for event queries. |
| **Nango** | External API integrations (800+ APIs). Auth, sync, actions, webhooks. | MIT | Self-hosted Docker |

---

## What We USE vs. What We BUILD (Corrected)

### What We USE

| Capability | What we use | Reality check |
|-----------|------------|---------------|
| **Payments** | Stripe (Elements + Tax + Radar) | PCI, 40+ payment methods, fraud, tax. We load Stripe Elements inside json-render checkout. Start with Stripe Checkout, upgrade to Elements. |
| **Auth** | **ZITADEL** (self-hosted Docker, MPL-2.0) | One ZITADEL instance, two auth flows: platform users (store owners) and store customers (buyers). Multi-tenancy (each store = org). Pre-built sign-in UIs. MFA, SSO, passwordless. No auth UI to build. |
| **Renderer** | json-render core + react (Apache 2.0) | NOT `@json-render/next` (no Next.js lock-in). SSR via `resolveElementProps()` + React 19 `renderToPipeableStream()` in any Node/Hono runtime. |
| **State machine** | **XState** (MIT, 28k stars) | States, guards, transitions, actors, async. Runs server-side. Machine definitions stored as JSONB in DB. |
| **Integrations** | **Nango** (MIT, self-hosted Docker) | 800+ external APIs. OAuth, sync, actions, webhooks, MCP for agents. User writes one TypeScript file, Nango handles infrastructure. |
| **Visual editor** | **GrapesJS** (MIT, 21k stars) | Drag-drop â†’ JSON. Custom components per catalog entry. Commerce component traits defined alongside Zod schemas. |
| **Hosting/edge** | Cloudflare Workers + R2 + KV | 300+ locations, zero egress, sub-50ms. KV for segment-cached layouts. R2 for media. Stream for video. |
| **Auth** | ZITADEL (MPL-2.0, Docker) | Self-hosted. Pre-built admin console + sign-in UIs. Multi-tenancy per store. PII in our infra. |
| **AI models** | OpenAI + Claude + fine-tuned | Multi-provider. No single-vendor dependency. Different models for layout vs. content vs. analysis. |
| **Shipping** | Shippo / EasyPost | Carrier integrations done. Don't maintain. Can also use Nango if store uses a niche carrier. |
| **Async workflows** | BullMQ + Redis | Side effects after state transitions (email, calendar, webhook). Retry, delay, dead-letter. |
| **DB** | Postgres + Redis | JSONB for content. Relational for orders/payments/bookings. Redis for cart/session/queues. |
| **Server** | Hono + Node.js | TypeScript everywhere (edge, server, client). Runs on Cloudflare Workers. |

### Corrections (What I Got Wrong)

1. **Shopify Hydrogen + Oxygen**: Shopify DOES have edge delivery (Oxygen on Cloudflare Workers). Our advantage is not technology â€” it's ACCESSIBILITY. Hydrogen requires a custom React project (2-6 months). Our app installs in 30 minutes.

2. **Nosto**: Does MORE than product recommendations â€” can personalize hero, banners, category pages, content blocks, SERPs. BUT the limit remains: content swap within fixed placements, not layout generation.

3. **Content system**: Content types have Zod schemas (like json-render catalog but for data). JSONB for most content. Relational for transactional data (orders, payments, bookings) that need ACID.

4. **Auth**: Self-hosting auth (Lucia) we have to build login/register/password-reset/admin UI ourselves. **ZITADEL** (open source, Docker) provides all of this plus multi-tenancy, MFA, SSO. Extra Docker service but we don't build auth UI.

### What We BUILD (Differentiation)

| What | Why we build it | Competitors do |
|------|---------------|----------------|
| **AI layout generation** | Prompt â†’ valid json-render JSON. Core AI engine. | Nosto fills pre-defined slots. We generate new component trees. |
| **Content type system** | Zod-validated types. Same catalog pattern as json-render but for data. Same system for both layout and content. | Contentful has content types but disconnected from layout. |
| **Context engine** | Visitor signals â†’ segment â†’ which layout variant to serve | Dynamic Yield: content swap within fixed layouts. We: layout generation per visitor. |
| **Per-visitor layout personalization** | Different component tree per visitor segment (mobile-new, desktop-returning) â€” not content swap | Nobody does this at our price. |
| **AI agent manager** | Human-in-the-loop. Merchant assigns tasks, AI does work, merchant approves. | Nosto Huginn: marketing campaigns only. |
| **AI generates state machine definitions** | Describe commerce flow â†’ AI generates machine â†’ human approves | Nobody does this for commerce. |
| **User function runtime** | Users deploy custom logic to edge/server/client. json-render actions call them. | Supabase Edge Functions (general). Ours is commerce-contextual. |
| **Plugin system** | Register components + content types + actions + state machines. AI discovers via catalog.prompt(). | Shopify App Store (closed). n8n nodes (general). Ours: use-case-native (commerce as first example). |
| **Nango connector bridge** | Actions registered by Nango appear in json-render catalog. Trigger from UI or state machine. | n8n nodes. Ours: connected to commerce state machines. |
| **Admin UI with json-render** | Admin dashboard uses same json-render catalog as storefront. Admin components + storefront components in one spec. | Shopify admin (separate from theme). Webflow admin (separate). Ours: same system. |

---

## State Machine Engine (Workflow Logic Layer)

**json-render handles UI. XState handles workflow logic.** json-render's `ActionBinding` dispatches actions from UI. Our state machine engine executes transitions, guards, locks, side effects.

### Architecture

```
json-render dispatches action â†’ State machine executes:
  1. Load machine definition from DB (stored as JSONB)
  2. Check guard (slot available? payment received? inventory in stock?)
  3. Lock row (SELECT FOR UPDATE â€” prevents double-booking, overselling)
  4. Atomic transition (UPDATE state WHERE current_state = X)
  5. Queue side effects (BullMQ: email, calendar, Nango integration)
  6. Log to analytics (who, what transition, guard result, duration)
  7. Return new state â†’ json-render onSuccess.set â†’ UI re-renders
```

### Machine Definitions

Machine definitions are stored as JSONB in the DB â€” not hardcoded. AI can generate new machines from a description. Human approves. XState executes.

**XState does NOT understand commerce or our JSON definitions natively.** XState is a general-purpose state machine library â€” it knows states, transitions, guards, and actors. It does NOT know about bookings, checkouts, permissions, Stripe payments, or our analytics pipeline. We build a WRAPPER that reads machine definitions from the DB, passes them to XState for execution, and handles commerce-specific guard checks, side effects (email, Nango sync, calendar invites), and analytics logging.

```json
{
  "id": "booking",
  "initial": "pending",
  "states": {
    "pending": { "on": { "PAY": { "target": "paid", "guard": "paymentReceived" } } },
    "paid": { "on": { "CONFIRM": { "target": "confirmed", "guard": "slotAvailable" } } },
    "confirmed": { "on": { "COMPLETE": "completed", "CANCEL": { "target": "cancelled", "guard": "cancellationAllowed" } } }
  }
}
```

### Dual Format: JSX For Humans, JSON For Machines

**JSON is for machines (AI, edge, cache, diff) â€” not for humans to read or edit directly.** Developers and advanced merchants who want to edit definitions directly see readable JSX. The system compiles JSX â†’ JSON. AI generates JSON directly.

```
JSX (human writable)         â†’    JSON (AI/machine)
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€                  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
<ProductPage>                      { "type":"ProductPage",
  <Hero title={product.title}        "children":[
    image={product.image} />          { "type":"Hero",
  <AddToCart variant="sticky" />        "props":{...} },
  {user.isNew && <SocialProof />}    { "type":"AddToCart",
</ProductPage>                          "props":{...} },
                                      { "type":"SocialProof",
                                        "condition":{...} }
                                    ] }

Layout templates:  JSX â†’ JSON    Developers and AI work in different formats.
Content types:     JSX â†’ JSON    Machine always uses JSON.
State machines:    JSX â†’ JSON    Human optionally uses JSX.
AI generates:      JSON only     Both compile to the same JSON engine.
```

### Storage Strategy Per Content Type

| Content type | Storage | Why |
|-------------|---------|-----|
| Products, pages, blog, FAQ, testimonials | **JSONB** | Read-heavy. One writer (merchant). No concurrent writes. |
| Orders, payments, bookings, subscriptions, inventory | **Relational** | Write-heavy. Concurrent writes. Need ACID, row-level locks. |
| State machine definitions | **JSONB** | Rarely changes. Executed by XState engine. |
| Layout templates, variants | **JSONB in Postgres + KV cache** | Read-heavy. Versioned. Cached at edge. |

---

## Auth: Dual Flow (One ZITADEL Instance)

**One ZITADEL Docker service. Two distinct auth flows.** ZITADEL handles multi-tenancy natively (each store = an organization).

```
ZITADEL
  â”œâ”€â”€ Org: "store-123" (platform â€” our customer)
  â”‚     â”œâ”€â”€ Role: admin â†’ Store owner (login to admin dashboard)
  â”‚     â””â”€â”€ Role: support â†’ Our team
  â”‚
  â””â”€â”€ Org: "store-123-customers" (store buyers)
        â”œâ”€â”€ Role: customer â†’ Buyers (login to store)
        â””â”€â”€ Login options: email/password, Google/Apple, magic link
```

| Feature | Platform admin | Store customer |
|---------|---------------|----------------|
| MFA | âœ… Available | âœ… Available (store owner decides) |
| SSO | âœ… Google/GitHub | âœ… Google/Apple |
| Passwordless | âŒ | âœ… Magic link |
| Pre-built UI | ZITADEL admin console | ZITADEL sign-in (customized per store) |

---

## Integrations: Nango (External APIs)

**Nango is the integration layer.** 800+ APIs through one unified interface. OAuth, rate limiting, retries, sync, actions, webhooks â€” all handled by Nango.

```
User writes ONE TypeScript file:
  syncToQuickBooks.ts â†’ Business logic only

Nango handles:
  OAuth tokens, refresh, scopes
  Rate limiting, retries, backoff
  Scheduling, checkpoints, delta sync
  Environments (dev/staging/prod)
  Monitoring, logs, alerts, tenant isolation

Our platform discovers:
  New action "nango.syncToQuickBooks"
  â†’ Available in json-render catalog (UI can trigger)
  â†’ Available in state machine as side effect (machine can trigger)
  â†’ AI knows about it (via catalog.prompt())
```

---

## User Functions (Custom Business Logic)

| Runtime | Location | Use case | Latency |
|---------|----------|----------|---------|
| **Edge** | Cloudflare Worker | Per-request logic (shipping calc, discount rules) | <10ms |
| **Server** | Hono route | Heavy logic (batch processing, report generation) | <50ms |
| **Client** | Browser | UI-only transformations (formatting, local state) | Instant |

User deploys via CLI or admin UI text editor. The function appears in json-render's action catalog automatically. UI can call it via `{ action: "callPlugin", params: { function: "myCustomLogic", ... } }`.

---

## WebSocket

Not built into json-render. Available at the platform level (Hono + Cloudflare Workers support WS). Custom React components in our catalog can use WebSocket for real-time features:
- Live chat (between store owner and visitors)
- Real-time analytics dashboard
- Collaborative store editing (via GrapesJS)
- Order status push notifications

---

## The Full Stack (Bubble + n8n, Use-Case-Native; commerce as first example)

| Layer | What | User sees |
|-------|------|-----------|
| **AI** | Generates layouts, content types, state machines | Prompt â†’ Store |
| **UI** | json-render + GrapesJS | Visual editor + live preview |
| **Workflow logic** | State machine engine (XState) | Automations for booking, checkout, refund |
| **Integrations** | Nango (800+ APIs) | Connect tools via admin UI |
| **Auth** | ZITADEL (self-hosted, multi-tenant) | Pre-built sign-in for platform + store |
| **Storage** | Postgres JSONB + relational | Transparent â€” same API for both |
| **Edge** | Cloudflare Workers + KV + R2 | Sub-50ms delivery globally |
| **Extensibility** | Plugin system + user functions | Build custom components, machines, integrations |

**Like Bubble for any use case. Like n8n for automation. But use-case-native (commerce as the first example), AI-driven, and open source.**

---

## Corrected Competitive Analysis

### Nosto
Does more than recommendations: hero, banners, category pages, content, SERPs. BUT: content swap within fixed placements. We generate layout structure per visitor.

### Shopify Hydrogen + Oxygen
Edge delivery EXISTS. Our advantage: 30-minute app install vs 2-6 month custom React project. 95% of Shopify stores can't use Hydrogen.

### Unbounce / Instapage
AI routes to pre-built variants. No commerce, no checkout. Content swap within fixed layouts.

### Optimizely
Enterprise CMS + experimentation + commerce (acquired add-on). $50k-500k+/yr. AI for marketing campaigns, not storefront optimization.

### Bubble
General app builder. Build everything from scratch (auth, DB, workflows, hosting). We're use-case-native (commerce as first example) â€” 80% pre-built.

### n8n / Zapier
General automation. Blank canvas â€” build every workflow from scratch. We have pre-built commerce state machines with configurable Nango connectors.

---

## Key Decisions (Final)

| Decision | Choice | Why |
|----------|--------|-----|
| **First entry point** | Shopify app (JS injection, one product) | Lowest friction, proves value fast |
| **Auth provider** | ZITADEL (self-hosted Docker, MPL-2.0) | Pre-built auth UI + admin console + multi-tenancy. PII on our infra. ZITADEL handles passwords, OAuth, MFA, sessions. API server never touches raw PII. |
| **Auth validation** | Edge Worker (Cloudflare) validates JWT → redirects to ZITADEL login on failure | Stops unauthenticated requests BEFORE they reach the API server. Invalid/missing JWT → HTTP 302 redirect to `auth.store.com/sign-in?redirect_uri=/original-page`. Valid JWT → pass through with tenantId/userId extracted. Modeled after Shopify/Amazon pattern: auth is infrastructure-level, not application-level. Hono middleware as fallback for internal API calls. |
| **State machine** | XState + our engine (definitions in DB) | XState handles transitions/guards/actors. Definitions stored as JSONB. AI generates them. |
| **Integrations** | Nango (self-hosted Docker, MIT) | 800+ APIs. User writes one TypeScript file. Auth, retries, sync handled. |
| **Rendering architecture** | Split: edge worker (SEO prerender) + client bundle (interactivity). API server never runs React. | Hono is pure API. Edge Worker renders SEO pages (product, collection, blog) to HTML via React 19 stream. Browser renders interactive pages from JSON spec via json-render runtime. No React on API server — modeled after Shopify (Oxygen storefront vs Core API) and real big-commerce separation patterns. |
| **Visual editor** | GrapesJS (MIT) | Drag-drop â†’ JSON. Custom commerce traits per catalog entry. |
| **Content storage** | JSONB for read-heavy, relational for ACID | Products/pages/blog in JSONB. Orders/payments/bookings in relational. |
| **Admin UI** | Built with json-render (same catalog) | Same system as storefront. Admin components + storefront components in same spec. |
| **AI control** | Manageable agents (human-in-the-loop) | Assign tasks, AI does work, you approve. Default: nothing goes live without OK. |
| **Open source** | One open server (WordPress model) | Free to self-host. Paid managed service on top (hosting, AI credits, enterprise). |
| **User functions** | Deploy to edge/server/client | Custom logic lives outside core. json-render actions call them. |
| **AI agents** | Mastra (TypeScript, open source) | Tool-based agent framework. Guardrails (auto/approval/denied). Memory (30-day window). Same TypeScript stack. |
| **Plugin system** | Register components + actions + machines + content types | Open ecosystem. AI discovers via catalog.prompt(). |

---

## AI Agent Permissions (Mastra Framework)

**Agents have three permission levels â€” never blindly trusted:**

| Guard | What it means | Examples |
|-------|--------------|----------|
| **Auto** | Executes without approval | Read analytics, suggest optimizations, flag underperformance |
| **Human_approval** | Generates draft, merchant must approve | Publish layout, publish content, run A/B test |
| **Denied** | AI can never do this | Change pricing, process refunds, access PII, delete content, modify orders |

### Token & Pricing

| Tier | AI actions/month | Who pays LLM |
|------|-----------------|--------------|
| Free (self-host) | Unlimited | User provides their own API key |
| Starter ($99/mo) | 500 | We cover |
| Pro ($199/mo) | 2,000 | We cover |
| Business ($499/mo) | 10,000 | We cover |
| Enterprise | Custom model | User pays fine-tuning |

| Action type | Token cost | Notes |
|-------------|-----------|-------|
| Layout/state machine generation | 1 action | Generate + validate + cache |
| Content write | 1 action | Per content piece |
| Analytics query | **Free** | DB query, not LLM |
| A/B test execution | **Free** | Bandit algorithm, not LLM |
| ML feedback loop | **Free** | Postgres aggregation |


### XState + Nango: Orchestrator + Integrator

**XState orchestrates flow. Nango handles external calls.** XState never calls APIs directly, never stores API keys, never handles rate limits or OAuth. The machine is pure JSON. Nango manages all external communication.

| Layer | Responsibility | Format |
|-------|---------------|--------|
| **XState** | When to call, which state to go to on success/failure | JSON (AI-generatable) |
| **Nango** | How to call (URL, auth, retries, rate limits, error handling) | TypeScript (developer-written) |
| **Our handlers** | Guard logic, simple actions | TypeScript (developer-written) |

XState decides the flow. Nango manages the external. The machine stays clean JSON. The integrations stay testable TypeScript.

---

## The Final One-Line

**Open source platform â€” JSON-powered UI, XState workflow engine, Nango integrations, AI agents you manage. Like Bubble + n8n, but use-case-native (commerce as the first example). AI generates what's reusable. Humans control what matters.**






