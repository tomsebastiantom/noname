# Product Principles & Positioning

## The Core Thesis

**The storefront should be as intelligent as the ad that sent the visitor there.**

Facebook AI optimizes who sees your ad. Google AI optimizes the keyword match. But the **storefront itself** — the layout, the hero, the product grid, the checkout flow — is still the same for every visitor.

We are building the platform where every storefront is **personalized per visitor, optimized by ML, and manageable through AI agents you control** — all in one open source server.

> **Framing — "commerce"/"storefront" are example verticals, not the product.** This document uses commerce/storefronts as a concrete illustration. The platform is **identity-agnostic** and powers any use case (booking, membership, SaaS, content); commerce is the first vertical we validate against, not the platform's identity.

---


## What We Are

An **open source AI-native platform** where everything is built in — not stitched together from 7 separate tools.

| Component | What stores use today | Our server has it built in |
|-----------|---------------------|---------------------------|
| **Commerce** | Shopify / WooCommerce / BigCommerce | Cart, checkout, payments, products, inventory, subscriptions |
| **CMS** | WordPress / Contentful / Strapi | Pages, products, media, blog. **Visual inline editor (click-to-edit on live storefront)**. |
| **Analytics** | Google Analytics / Mixpanel / Amplitude | Schema-attributed analytics. Every event knows which layout variant drove it. |
| **Observability** | HotJar / FullStory / LogRocket | Heatmaps, session replays, funnel analysis, drop-off detection. Built into the dashboard. |
| **A/B Testing** | VWO / Optimizely / Google Optimize | Multi-armed bandit. AI generates variants. Auto-promotes winners. Built-in flag system for progressive rollouts. |
| **Personalization** | Dynamic Yield / Bloomreach | Per-visitor layout generation. Edge delivered. Built-in flag system for progressive rollouts. |
| **Landing Pages** | Unbounce / Instapage | Store pages are landing pages. AI optimizes per traffic source. |
| **AI Content** | Jasper / Copy.ai / ChatGPT | AI agents that know your products, inventory, and conversion data. |

**Why built-in matters**: When everything runs on one server with one data model, attribution is exact. The ML engine connects directly to experiments. Insights surface in the same dashboard where you assign agents to fix them. You don't stitch tools together — you just set up your store.

### What We Are NOT

| Misconception | Reality |
|--------------|---------|
| "Shopify alternative" | Shopify is a back-office + theme store. We can integrate WITH Shopify or replace the frontend entirely. Both modes work. |
| "Website builder" | Webflow builds static pages. We build adaptive, per-session, AI-optimized systems that continuously improve. |
| "Enterprise CMS like Optimizely" | Optimizely is CMS + experimentation for Fortune 500 with 10-person teams and $50k+/yr. We bring the same capabilities to any store, open source, $99-299/mo. |
| "Landing page tool like Unbounce" | Unbounce optimizes marketing pages only. No commerce, no cart, no checkout. We optimize the entire store. |
| "AI code generator" | Bolt/v0 generate code once. We generate AND continuously optimize live in production per visitor. |
| "Personalization plugin" | Dynamic Yield optimizes content in fixed layouts. We generate the layout itself per visitor. |

---

## Product Principles

### 1. AI is Your Team Member, Not the Engine
You decide what AI does. You assign tasks to AI agents. AI generates, you review. AI suggests, you approve. You control the guardrails. The platform defaults to you being in charge — AI is opt-in, per-feature, with human review before any live change.

### 2. ML Drives Everything: Data → Experiments → Visual Insights → Agents → Personalization
Every visitor interaction feeds the ML model. The ML engine runs continuous experiments (A/B tests, multi-armed bandit), surfaces visual insights to the merchant ("your mobile checkout drops 40%"), and lets them assign AI agents with one click to fix what ML found. Agents generate changes, merchant approves, ML personalizes per visitor. The loop feeds itself — more data → better experiments → sharper insights → smarter agents → higher conversion.

### 3. Content + UI + Commerce, Unified Through JSON
Pages, products, layouts, checkout flows — all are structured as JSON. This means the entire store is:
- **Cacheable** at CDN edges (2-5KB schemas, <20ms delivery)
- **Versionable** with full diff and instant rollback
- **Attributable** — every pixel traceable to the schema that generated it
- **Platform-agnostic** — same JSON renders on React, Vue, Flutter, React Native via json-render (open source)
- **AI-generatable** — LLMs output JSON more reliably than code; validatable before render

### 3. Context is King
User persona, device capability, business state, and environment all feed the AI before it generates a schema. The same product page looks completely different for a first-time mobile visitor vs. a returning VIP desktop customer — because the context is different.

### 4. Identity-Agnostic Base
Not a page builder that added a cart. Not a CMS that added a buy button. Workflows (e.g. catalog, cart, checkout, payments, subscriptions, inventory, pricing — in the commerce example) are native to the schema and the AI logic.

### 5. One Open Server (Like WordPress)
A single open source codebase you can deploy anywhere. Not microservices. Not a spec ecosystem. One server that does everything. Modify it. Add features. Extend it. Your data, your infrastructure.

### 6. Enterprise Features, Every Store
What Fortune 500 companies pay Optimizely $50k-500k+/yr for — A/B testing, personalization, analytics, ML optimization, AI agents — built in at $99-299/mo. Because a creator with one product deserves the same conversion optimization as a multinational brand.

---

## What Sellers Can Do

### Build Through Conversation
Describe what you sell. AI generates the complete store — layout, pages, products, checkout, SEO. 10 minutes from sign-up to published store.

### See What ML Found, Assign Agents With One Click
The ML engine watches every visitor interaction — clicks, scrolls, drop-offs, conversions. It runs A/B tests automatically and surfaces visual insights in a dashboard: heatmaps, funnels, segment comparisons, recommendations. "Your mobile checkout drops 40%." "Product page variant B converts 23% better." "iPad users abandon cart 2x more." Each insight has a button: **[Fix This]** → assigns an AI agent to generate a solution → you review → approve → it goes live.

### Manage AI Agents Like a Team
Assign tasks to AI agents. "Optimize my product page for mobile visitors." "Generate 3 checkout variants and A/B test them." "Write FAQ content for this category." "Find why cart abandonment is high on iPad." AI does the work. You review and approve. No code. No prompt engineering. Just manage.

### The Store Evolves Per Visitor
First-time mobile from TikTok? Video-first, 1-tap checkout. Returning desktop customer? Quick reorder, personalized bundles. Enterprise inquiry? Consultation form, premium pricing. Same URL. Different experience. Every time.

### AI Handles the Work (When You Ask)
Product descriptions from a photo. SEO metadata. AI agent runs A/B tests automatically. Inventory urgency signals. Related product suggestions. You decide what AI does and when.

### Edit Visually (When You Want Control)
**Click-to-edit on the live storefront** (`?edit=true`). Drag-drop canvas with component palette, layer tree, props panel. Code-split editor chunk (~50KB) loaded only for admins. AI co-pilot for natural language edits. Role-based guardrails. No code required.

### Sell Anything
Digital, physical, services, subscriptions, bundles, donations. The commerce primitives change per vertical; the AI engine stays the same.

### Sell Globally
Not just translation — cultural UX adaptation. Layout direction, information hierarchy, visual density, regulatory compliance — all generated per locale by AI.

### Own Everything
Your domain. Your Stripe account. Your customer data. Full export. No lock-in. Open source: you can run it yourself.

---

## Feature Set

### Foundation (Phase 0-1)

| Feature | Description |
|---------|-------------|
| CMS (Content Management) | Pages, products, media, blog. **Visual inline editor (click-to-edit on live storefront)**. |
| AI Storefront Generation | Natural language → complete store with products, pages, checkout |
| Product Catalog | Add/edit products; AI generates descriptions, SEO, variants on request |
| Cart & Checkout | Stripe-powered; optimized per order value and user context |
| AI Agent Dashboard | Assign tasks to AI agents. Review output. Approve or reject. |
| Custom Domain | One-click custom domain with SSL, included (not upsold) |
| Shareable Link | `platform.com/seller-name` format |
| Mobile-First Rendering | All generated stores optimized for mobile by default |
| Basic Analytics | Visitors, conversion rate, revenue, top products |
| AI Copilot (v1) | Chat: "Add a testimonial section" → AI modifies the store |
| Stripe Connect | Sellers link their own Stripe; direct payouts |

### Intelligence (Phase 2)

| Feature | Description |
|---------|-------------|
| A/B Testing Engine | AI generates layout variants; multi-armed bandit optimizes |
| Per-Visitor Personalization | Different storefront per visitor segment |
| Edge ML Inference | Lightweight models at CDN edge for sub-50ms decisions |
| JSON Diff Protocol | Only changed nodes sent to client (~200 bytes vs ~20KB). Uses json-render's built-in `diffToPatches()` (RFC 6902) — reuse, don't build. |
| Visual CMS (v1) | **Inline editor (click-to-edit)** + AI co-pilot → valid JSON |
| i18n & Localization | Locale-aware schema generation, RTL, cultural adaptation |
| Schema Telemetry | Every JSON node traceable; analytics knows which schema drove which conversion |
| ML Feedback Loop (v1) | Events → feature store → model retrain → better schemas |
| **Visual ML Insights Dashboard** | Heatmaps, conversion funnels, drop-off analysis, segment comparisons, automated recommendations. Merchant sees what ML found and clicks one button to assign an AI agent. |
| Memberships & Subscriptions | Recurring billing, gated content, member portal |

### Commerce Scale (Phase 3)

| Feature | Description |
|---------|-------------|
| Shopify Integration Mode | Connect existing Shopify store. Replace frontend only. Dual-path. |
| Advanced Commerce | Dynamic bundles, cross-sells, inventory intelligence, multi-currency |
| Visual CMS (v2) | Role-based editing (developer, marketer, translator, AI agent) |
| Self-Healing UI | Components request AI fallback when data sources fail |
| Marketplace Support | Multi-vendor; each vendor gets AI-optimized micro-storefront |
| Open Source Server Launch | Ship the single-server codebase. Anyone can deploy. |
| SDK & API | Public API for schema generation, commerce, analytics |
| App Marketplace (v1) | Third-party extensions, custom renderers, vertical schemas |
| B2B Commerce | Net-30 invoicing, bulk pricing, approval workflows |

### Ecosystem (Phase 4)

| Feature | Description |
|---------|-------------|
| Enterprise Features | SSO, RBAC, audit logs, SLA, dedicated support |
| On-Premise Option | Self-hosted server for regulated industries |
| Custom AI Agents | Fine-tuned per-store AI agents with custom instructions |
| Additional Renderers | Flutter, Swift, Kotlin, Unity renderers (via json-render ecosystem) |
| Advanced ML | Transfer learning across stores; cross-vertical optimization |
| White-Label | Agencies fully white-label the platform for their clients |
| Global Compliance | GDPR, CCPA, LGPD, age gating, product regulations per market |

---

## Competitive Comparison

### Landing Page & Optimization Tools

| Feature | Unbounce | Instapage | VWO | Dynamic Yield | Optimizely | Us |
|---------|----------|-----------|-----|--------------|-----------|-----|
| AI per-visitor page routing | ✅ Smart Traffic | ✅ AI Experiments | ❌ | ❌ | ❌ | ✅ |
| AI generates new layouts | ❌ Routes to pre-built | ❌ Routes to pre-built | ❌ | ❌ Content swap only | ❌ Content swap only | ✅ Generates per visitor |
| Native checkout (commerce example) | ❌ | ❌ | ❌ | ❌ | 🟡 Acquired, B2B focus | ✅ |
| A/B testing | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ML visual insights + agent assignment | ❌ | ❌ | 🟡 Reports only | 🟡 Reports only | 🟡 Reports only | ✅ Insights → one-click assign agent |
| CMS built in | ❌ | ❌ | ❌ | ❌ | ✅ Enterprise .NET | ✅ Open source |
| Manageable AI agents | ❌ | ❌ | ❌ | ❌ | 🟡 Opal (marketing only) | ✅ Full store agents |
| Price | $99-399/mo | $199-599/mo | $399-999/mo | $80k+/yr | $50k-500k+/yr | $99-299/mo |
| Open source | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

### E-Commerce Platforms

| Feature | Shopify | BigCommerce | WooCommerce | Webflow | Us |
|---------|---------|-------------|-----------|---------|-----|
| AI-generated storefront | ❌ | ❌ | ❌ | ❌ | ✅ |
| Per-visitor adaptation | Plugin ($) | Plugin ($) | ❌ | ❌ | ✅ (core) |
| Auto A/B testing | Plugin ($) | Plugin ($) | ❌ | ❌ | ✅ (core) |
| Visual CMS | ⚠️ Basic | ⚠️ Basic | ⚠️ Basic | ✅ | ✅ + AI |
| Headless / API-first | ⚠️ Hydrogen | ⚠️ | ✅ | ✅ | ✅ |
| Open source core | ❌ | ❌ | ✅ (Woo) | ❌ | ✅ |
| AI agents you manage | ❌ | ❌ | ❌ | ❌ | ✅ |
| Built-in analytics + observability | ❌ Separate tools | ❌ Separate tools | ❌ Separate tools | ❌ Separate tools | ✅ Built in |
| Total tools needed for full stack | 7+ | 7+ | 7+ | 5+ | **1** |

### AI Code Generators

| Feature | Bolt | v0 | Lovable | Us |
|---------|------|----|---------|-----|
| AI generates UI | ✅ (once) | ✅ (once) | ✅ (once) | ✅ (continuous) |
| Live optimization | ❌ | ❌ | ❌ | ✅ |
| Identity-agnostic | ❌ | ❌ | ❌ | ✅ |
| Per-visitor adaptation | ❌ | ❌ | ❌ | ✅ |
| CMS for non-devs | ❌ | ❌ | ❌ | ✅ |
| Edge delivery | ❌ | ❌ | ❌ | ✅ |

---

## Revenue Model

| Tier | Monthly | GMV Fee | Best For | Key Features |
|------|---------|---------|----------|-------------|
| **Free (Self-Host)** | $0 | 0% | Developers, tinkerers | Full open source server. Run it yourself. |
| **Starter** | $99 | 0% | Small stores, Shopify mode | AI storefront, A/B testing, basic AI agents |
| **Pro** | $199 | 0% | Growing DTC brands | Personalization, AI agents with custom tasks, advanced analytics |
| **Business** | $499 | 0% | Multi-product stores, agencies | ML feedback loop, API access, team seats |
| **Enterprise** | Custom | Custom | B2B, marketplace, on-prem | Custom models, SSO, SLA, white-label |

**Revenue streams:**
1. **Managed hosting subscriptions** ($99-499/mo)
2. **Enterprise contracts** ($50k-$500k ACV)
3. **AI agent usage credits** (pay per task for heavy users)
4. **Marketplace** (revenue share on third-party extensions)

No GMV fee. No transaction percentage. Flat subscription pricing.

---

## Why This Wins (The Moat)

### 1. ML + Agent Feedback Loop (The Flywheel)
Every visitor interaction feeds the ML engine. ML runs experiments, finds insights, shows them visually to the merchant, and lets them assign AI agents with one click. Agents generate fixes, merchant approves, changes go live, ML personalizes per visitor, data flows back. More data → better experiments → sharper insights → smarter agents → higher conversion → more data. Competitors have either ML optimization OR AI agents — but not the integrated loop where ML insights directly trigger agent tasks.

### 2. Enterprise Features for Every Store
Optimizely, Dynamic Yield, VWO — they charge $50k-500k+/yr and require a team of specialists. We deliver the same capabilities in an open source server for $99-299/mo. A creator with one product gets the same conversion optimization as a Fortune 500 brand.

### 2. Manageable AI Agents (Not Scary AI Takeover)
Every other AI commerce tool says "AI does everything automatically." We say "you're in charge." Assign tasks to AI agents. Review their work. Approve or reject. This builds trust, reduces liability, and keeps the seller in control.

### 3. Open Source = No Lock-In
Like WordPress — you can run it yourself, modify it, add features, or leave at any time. The managed service is convenience, not captivity. For developers and agencies, the open server is a platform to build on.

### 4. Per-Visitor, Not Per-Template
Competitors can add "AI-assisted" features to existing static architectures. They cannot add "generate a different layout per visitor" without re-architecting their entire platform. This is a paradigm shift, not a feature they can copy.

### 5. Vertical-Aware AI
We understand inventory levels, margin goals, pricing psychology, tax rules, shipping constraints. Generic AI builders (Bolt, v0, Unbounce) know about landing pages. We know about selling.

### 6. Dual-Path: Shopify Integration + Standalone
Work with Shopify (replace frontend only) or standalone (own the full stack). Both paths share the same AI engine and codebase. Shopify for distribution and trust. Standalone for independence and margins.

### 7. Data Flywheel
Every visitor interaction on every store trains the ML model. More stores → more training data → better optimization → higher conversion → more stores.

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| First vertical | Any store (dual-path) | Shopify integration for commerce stores. Standalone for everyone. Same server. |
| Schema format | JSON (via json-render) | LLMs output JSON more reliably than code. Validatable before render. Edge-cacheable. Multi-platform. |
| Visual Editor | Custom inline editor (not GrapesJS) | Click-to-edit on live storefront. Drag-drop canvas, palette, layer tree, props panel. Code-split (~50KB). Loaded only for admins. |
| Payment provider | Stripe Connect + Shopify Payments | Dual: Shopify mode uses merchant's existing payments. Standalone uses Stripe Connect. |
| Edge provider | Cloudflare primary | Workers = fastest cold start; R2 = zero egress; Workers KV for segment caching |
| AI provider | Multi (OpenAI + Claude + fine-tuned) | No vendor dependency; different models for different tasks |
| AI control model | Manageable agents (opt-in, reviewed) | AI is your team member, not the engine. You assign. AI does. You approve. Default: seller in control. |
| Open source strategy | One open server (WordPress model) | Single deployable codebase. Free to self-host. Paid managed service on top. |

