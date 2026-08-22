# Platform Overview
## Open Source AI Platform

The platform is an **open source platform** with a CMS, AI-personalized experiences, manageable AI agents, an ML engine that collects data and runs experiments, and enterprise-grade optimization — all in one deployable codebase. It treats the user interface as data (JSON) rather than code, uses the open source json-render library (Vercel-backed, Apache 2.0) to map JSON to pixels, and wraps everything in a managed service that any store can afford.

> **Framing — "commerce" is an example vertical, not the product.** This document uses commerce/storefronts as a concrete illustration. The platform is **identity-agnostic** and powers any use case (booking, membership, SaaS, content); commerce is the first vertical we validate against, not the platform's identity.

**The core loop**: ML collects data → runs experiments → generates visual insights → user assigns AI agents → agents generate changes → user approves → ML personalizes per visitor → more data collected.

**Dual-path architecture**: Works with Shopify (replace frontend only) or standalone (full stack). Same codebase. Same AI engine. Same managed service.

---

## The Paradigm Shift

### The Old Way

```
1. Store owner designs/chooses a theme
2. Developer customizes it (CSS, Liquid, React)
3. Same layout for every visitor
4. "Personalization" = swap a banner image
5. A/B testing requires separate app + manual setup
6. Enterprise optimization = $80k+/yr tools + dedicated team
7. Different tools for CMS + Commerce + A/B testing + Analytics
```

### The New Way (This Platform)

```
1. Install the server (or use our managed service)
2. Connect your Shopify or use built-in commerce
3. Manage AI agents: assign tasks, review output, approve
4. AI generates per-visitor storefront automatically
5. ML continuously optimizes all variants
6. Everything in one server: CMS + commerce + AI + analytics
7. Enterprise features at $99-299/mo
```

---

## What Sellers Can Do

### 0. ML Collects Data, Runs Experiments, Shows You Insights

Before you even open the agent dashboard, the ML engine is already working:

```
Every visitor → ML collects: device, referrer, clicks, scrolls,
time on page, cart actions, drop-offs, conversions
       │
       ▼
ML runs experiments: multi-armed bandit routes traffic to
best variants, A/B tests run continuously across all pages
       │
       ▼
ML generates visual insights dashboard:
  ┌────────────────────────────────────────────────────┐
  │  🔴 Mobile checkout drops 40% at address field    │
  │  🟢 Hero variant B converts 23% better on desktop │
  │  🟡 iPad users 2x cart abandonment rate           │
  │  💡 Bundle "mat + blocks" adds $18 AOV (12k sss) │
  │                                                    │
  │  [Assign Agent] [Dismiss] [View Details]           │
  └────────────────────────────────────────────────────┘
       │
       ▼
Each insight has "Assign Agent" — one click creates
a task for an AI agent to fix exactly what ML found
```

You don't hunt for problems. ML finds them, shows them to you, and offers to fix them. You just approve.

### 1. Manage AI Agents Like a Team

This is the key difference from every other AI commerce tool. You don't surrender control to AI. You **manage** AI.

```
Agent Dashboard:
  ┌─────────────────────────────────────────┐
  │  Assign a Task                          │
  │                                         │
  │  "Optimize my product page for mobile   │
  │   visitors — they have 40% lower        │
  │   conversion rate than desktop."        │
  │                                         │
  │  [Assign to AI Agent]                   │
  └─────────────────────────────────────────┘
  
  Agent Result:
  ┌─────────────────────────────────────────┐
  │  Analysis found:                        │
  │  - Mobile users scroll past CTA (below  │
  │    fold on small screens)               │
  │  - Product images load 2s slower on 4G │
  │                                         │
  │  Proposed changes:                      │
  │  1. Move CTA above fold (sticky bar)    │
  │  2. Compress images for mobile           │
  │  3. Show 3 specs instead of 8           │
  │  4. Add "trust badges" near CTA         │
  │                                         │
  │  View diff → [Approve] [Reject] [Modify] │
  └─────────────────────────────────────────┘
```

Example tasks you can assign:
- "Generate 5 homepage layout variants and A/B test them"
- "Write FAQ content for the Shipping category"
- "Find why iPad users have 50% higher cart abandonment"
- "Create a comparison page vs our main competitor"
- "Optimize our checkout for first-time visitors from Instagram"
- "Generate SEO metadata for all new products"

### 2. The Store Adapts Per Visitor in Real-Time

**Same URL. Completely different experience per visitor.**

| Visitor | What They See | Why |
|---------|---------------|-----|
| First-time mobile from Instagram | Video testimonials, 1-tap checkout, Apple Pay, social proof | Reduce friction for impulsive, low-trust visitor |
| Returning desktop customer | Quick reorder, personalized bundles, loyalty points | Maximize lifetime value |
| Enterprise B2B buyer | Net-30 invoicing, bulk pricing, dedicated contact | Support complex B2B buying |
| Visitor from Japan | Yen pricing, local payment methods, denser layout | Local conversion optimization |
| Low-bandwidth mobile user | Compressed images, text descriptions, simplified grid | Page loads in 1.2s instead of 8s |
| Cold email click-through | Credibility-first: case studies, logos, guarantees | Build trust for skeptical traffic |
| Warm referral from a friend | Social-proof-first: reviews, UGC, "Your friend loved this" | Leverage existing trust |

**This is not "swap a banner." The AI re-generates the JSON schema. Different components. Different hierarchy. Different checkout flow.**

### 3. CMS (Content Management)
- Pages, products, media, blog — all built in
- **Visual inline editor (click-to-edit on live storefront, `?edit=true`)**
- Drag-drop canvas with component palette, layer tree, props panel
- Code-split editor chunk (~50KB) loaded only for admins
- WordPress-like familiarity
- AI writes content when you ask: "Write a product description for this photo"
- All content is structured JSON — usable by both human visitors and AI agents

### 4. Everything Built In (One Server Replaces 7 Tools)

Most stores stitch together 7+ separate tools. Each has its own login, billing, data model, and integration — and none of them talk to each other. Our platform replaces all of them with one server.

| Tool stores use today | What it costs | Replaced by |
|----------------------|--------------|-------------|
| Shopify / WooCommerce | $39-399/mo + 2.9% fees | Built-in commerce engine |
| WordPress / Contentful | $0-399/mo | Built-in CMS + Inline visual editor |
| Google Analytics / Mixpanel | $0-299/mo | Built-in schema-attributed analytics |
| HotJar / FullStory | $39-199/mo | Built-in ML insights dashboard |
| VWO / Optimizely | $399-999/mo | Built-in bandit + personalization |
| Unbounce / Instapage | $99-599/mo | Built-in per-visitor AI generation |
| Jasper / Copy.ai | $49-499/mo | Built-in AI agents |
| **Total** | **$600-3,000+/mo** | **$99-299/mo** |

**Why built-in is better than stitched together:**

| Problem with separate tools | With our platform |
|----------------------------|------------------|
| Analytics says "mobile conversion is low" — need a different tool to run the test | ML detects it → shows visual insight → one click assigns AI agent → fix goes live. All in one place. |
| "Which layout variant drove this conversion?" — impossible to join across tools | Every event has schemaId + variantId + contextHash. Exact attribution. |
| Data synced between CMS, store, and analytics — often broken or delayed | Single data model. Everything is connected because it's the same system. |
| 7 logins, 7 bills, 7 support teams | 1 login, 1 bill, 1 platform. |
| Each tool has its own definition of "conversion" | One definition. One source of truth. |

### 5. Sell Anything
- Digital products, physical products, services, subscriptions, bundles, B2B
- Same platform. Different commerce primitives per vertical.
- Shopify mode: use your existing catalog. Standalone mode: built-in catalog.

### 6. Own Everything
- Open source server — run it yourself or use our managed service
- Export all data anytime
- Custom domain with SSL (included)
- No platform branding on paid plans
- Your Stripe account (standalone) or existing Shopify payments
- JSON schemas are portable — take them to any renderer

---

## How It Works (Technical)

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         VISITOR                                       │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ HTTP
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     EDGE LAYER (Cloudflare)                          │
│                                                                      │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────────┐  │
│  │ CDN Cache      │  │ Edge Worker    │  │ Edge ML Inference    │  │
│  │ (cached JSON   │  │ (personalize   │  │ (bandit routing,    │  │
│  │  schemas)      │  │  per visitor)  │  │  segment scoring)    │  │
│  └────────────────┘  └────────────────┘  └──────────────────────┘  │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  THE SERVER (Your Platform)                          │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────────┐  │
│  │ CMS Engine   │  │ AI Agent     │  │ Context Engine          │  │
│  │ (Pages,      │  │ Manager      │  │ (device, referrer,      │  │
│  │  products,   │  │ (assign,     │  │  location, segment,     │  │
│  │  media, blog)│  │  review,     │  │  business state)        │  │
│  │              │  │  approve)    │  │                         │  │
│  └──────────────┘  └──────────────┘  └───────────┬─────────────┘  │
│                                                   │                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┴─────────────┐  │
│  │ Commerce     │  │ Analytics    │  │ AI Generation           │  │
│  │ Engine       │  │ & Attribution│  │ (Layout LLM + Content   │  │
│  │ (cart,       │  │ (schema-     │  │  LLM + Commerce Logic)  │  │
│  │  checkout,   │  │  level       │  │ Output: JSON schema     │  │
│  │  payments,   │  │  tracking)   │  │ per visitor segment     │  │
│  │  inventory)  │  │              │  │                         │  │
│  └──────────────┘  └──────────────┘  └─────────────────────────┘  │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Data Abstraction Layer                                      │   │
│  │  ┌────────────────┐  ┌────────────────┐  ┌──────────────┐  │   │
│  │  │ Shopify Adapter│  │ Stripe Connect │  │ Custom       │  │   │
│  │  │ (products,     │  │ Adapter        │  │ Adapter      │  │   │
│  │  │  cart, orders) │  │ (standalone)   │  │ (future)     │  │   │
│  │  └────────────────┘  └────────────────┘  └──────────────┘  │   │
│  └─────────────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ JSON schema
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     json-render (Open Source)                        │
│  JSON → React / Vue / Svelte / React Native components              │
│  Zero layout logic. All intelligence is in the JSON.                │
└─────────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  VISUAL CMS (Custom Inline Editor)                  │
│  Click-to-edit on live storefront (`?edit=true`). Drag-drop canvas  │
│  with component palette, layer tree, props panel. Merchant edits    │
│  the exact page visitors see. Same URL, same components, same       │
│  catalog. Code-split editor chunk (~50KB) loaded only for admins.   │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **JSON through json-render**: AI outputs JSON, validated against schema, rendered by json-render. Safer, more reliable, multi-platform, edge-cacheable than direct code generation.

2. **Manageable AI agents**: AI never publishes anything without human approval. The seller assigns tasks, reviews output, and decides what goes live. This reduces liability and builds trust.

3. **json-render integration**: We don't build a renderer. json-render (14.9k stars, Apache 2.0, Vercel-backed) handles JSON→component mapping. We build commerce components for its catalog.

4. **Dual-path data abstraction**: Shopify adapter mode uses Shopify's backend. Stripe Connect adapter mode uses standalone commerce. Same AI engine, same frontend, different data sources.

---

## User Journeys

### Journey 1: The DTC Brand (Shopify Mode)

**Profile**: $2M yoga apparel brand on Shopify. Spends $5k/mo on Facebook ads. Same storefront for every visitor.

1. Installs our app from Shopify App Store
2. Connects store. Our server reads products and collections via Storefront API.
3. First visitor arrives from Instagram ad → AI generates mobile-first, video-hero storefront → conversion up 23%
4. Returning desktop customer → sees "quick reorder" layout with past purchases
5. Merchant assigns AI agent: "Optimize my product page for cold traffic from Facebook"
6. Agent generates 4 variants + runs A/B test → finds "trust badges above fold" wins by 34%
7. $5k/mo ad spend now converts 28% better → same ad budget, more revenue

**Value**: No developer needed. No $80k/yr personalization tool. One subscription, everything included.

### Journey 2: The Creator (Standalone Mode)

**Profile**: Fitness coach. Sells $47 workout plans + $199/mo coaching. No tech skills. Wants to leave Gumroad.

1. Signs up to our managed service. 10-minute setup.
2. AI agent asks 5 questions → generates complete store
3. Merchant reviews and approves the store
4. Uploads a selfie → AI agent writes product descriptions
5. "Agent: optimize my checkout for mobile" → generates 3 variants → A/B test runs
6. "Agent: write FAQ content" → generates complete FAQ → merchant reviews → approves
7. Store live at `coach-mike.store`. Conversion rate improving every week.

**Value**: What would cost $20k+ in dev/agency fees. Zero engineering. Zero manual optimization.

### Journey 3: The B2B SaaS (Standalone Mode)

**Profile**: Project management tool. $29-299/mo plans. Wants to optimize free trial → paid conversion.

1. Sets up via our managed service. Configures pricing tiers and trial flow.
2. AI agent generates 3 different onboarding flows (solo user, team signup, enterprise inquiry)
3. A/B test runs automatically → bandit finds "annual-first" pricing converts 34% better
4. AI agent assigned: "Find why trial users churn on day 5" → analyzes behavior → suggests in-app email trigger
5. ML feedback loop improves onboarding for every new segment

**Value**: Trial optimization that normally requires a dedicated growth team.

---

## Key Concepts

| Concept | Definition |
|---------|------------|
| **JSON Schema** | The structured representation of a store — layout, components, content, and logic. AI generates it. json-render renders it. Humans edit it visually. |
| **json-render** | Open source library (Vercel-backed, Apache 2.0) that maps JSON → platform-native UI components. We integrate, don't rebuild. |
| **AI Agents** | Manageable AI workers. Seller assigns tasks. AI does the work. Seller reviews and approves. Default: nothing published without human OK. |
| **Context Engine** | Gathers real-time signals (device, location, referrer, past behavior, business state) to determine which schema to serve per visitor. |
| **Bandit Optimization** | Multi-armed bandit algorithm that routes traffic to better-performing layout variants in real-time. Promotes winners automatically. |
| **JSON Diff** | Only changed nodes sent to client. A "page change" is ~200 bytes, not ~20KB. |
| **Edge Personalization** | JSON schemas cached at CDN edges. Lightweight edge workers personalize per segment. Sub-50ms delivery. |
| **Schema Telemetry** | Every JSON node carries a traceable ID. Analytics knows exactly which schema drove which conversion. No attribution guesswork. |
| **Data Abstraction Layer** | Adapter pattern: Shopify adapter (uses Shopify backend), Stripe Connect adapter (standalone), custom adapters (future). Same AI, different data sources. |
| **Dual-Path Architecture** | Same server works as Shopify frontend replacement or full standalone stack. Merchant chooses. Same AI. Same price. |

