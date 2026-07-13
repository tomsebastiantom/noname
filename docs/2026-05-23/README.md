# noname
## Open Source AI Platform

> **Everything a site needs: CMS, AI-personalized experiences, enterprise features, and AI agents you control — all built into one open source server. No stitching 7 tools together.**

---

> **Framing — "commerce" is an example vertical, not the product.** This README uses commerce/storefronts as a concrete illustration. The platform is **identity-agnostic** and powers any use case (booking, membership, SaaS, content); commerce is the first vertical we validate against, not the platform's identity.

## The Problem

Facebook AI optimizes your ads (who sees them). Nobody optimizes your storefront (what they see after they click).

| Tool | What it optimizes | For whom |
|------|------------------|----------|
| Facebook Ads AI | Ad targeting per user | Advertisers |
| Google Ads AI | Keyword bidding per query | Advertisers |
| Unbounce Smart Traffic | Landing page variant routing | Marketers (no commerce) |
| Optimizely Opal | Marketing content + campaigns | Enterprise teams (50k+/yr) |
| Shopify | ❌ Static theme for everyone | Merchants |
| **noname** | **Storefront per visitor** | **Any store owner** |

**The gap**: Every ad tool personalizes who sees your ad. Nobody personalizes what they see after they click. That's what we build.

---

## The Platform: Five Components, One Server

```
┌─────────────────────────────────────────────────────────────┐
│                    ONE OPEN SERVER                            │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ 1. CMS (Content Management)                             │ │
│  │    Pages, products, media, blog. Drag-drop editor.      │ │
│  │    AI writes content when you ask. WordPress-like.      │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ 2. AI-Personalized Storefront                           │ │
│  │    Per visitor, per session — different layout,         │ │
│  │    content, CTA, flow. Same URL. Same brand.            │ │
│  │    Edge delivered in <50ms globally.                    │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ 3. Manageable AI Agents                                 │ │
│  │    NOT "AI runs everything." YOU assign tasks.          │ │
│  │    "Optimize this page for mobile." "Generate 3 A/B    │ │
│  │    variants." "Find why mobile users drop off."         │ │
│  │    AI does the work. You review and approve/reject.     │ │
│  │    You're the manager. AI works for you.               │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ 4. ML Engine (Data + Experiments + Insights)            │ │
│  │    ┌─ Collects data: every click, scroll, conversion    │ │
│  │    ├─ Runs experiments: A/B tests, multi-armed bandit   │ │
│  │    ├─ Generates insights: "Your mobile checkout drops   │ │
│  │    │   off 40%. Product page variant B converts 23%    │ │
│  │    │   better."                                        │ │
│  │    └─ Visual dashboard: heatmaps, funnels, segments,   │ │
│  │       recommendations. The user sees what ML found.    │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ 5. Enterprise Features                                  │ │
│  │    A/B testing, per-segment personalization, SEO tools, │ │
│  │    multi-currency, multi-language. What Optimizely      │ │
│  │    charges $50k+/yr for, built in at $99-299/mo.       │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘

### How ML + Agents Work Together (The Feedback Loop)

```
Every visitor on every store
         │
         ▼
ML ENGINE collects data: clicks, scrolls, conversions, drop-offs, device,
traffic source, time on page, cart additions, checkout completions
         │
         ▼
ML RUNS EXPERIMENTS automatically:
  - Multi-armed bandit routes traffic to best variants
  - A/B tests run continuously across layout, content, CTA
  - Every variant attributed to exact schema ID
         │
         ▼
ML SHOWS INSIGHTS VISUALLY:
  ┌────────────────────────────────────────────────────┐
  │  ML Insights Dashboard                             │
  │                                                    │
  │  🔴 Mobile checkout drops 40% after enter address │
  │  🟢 Product page variant B converts 23% better    │
  │  🟡 iPad users abandon cart 2x desktop rate       │
  │  💡 New bundle suggestion: yoga mat + blocks      │
  │    adds $18 AOV (based on 12k sessions)            │
  │                                                    │
  │  [Assign Agent to Fix] for each insight            │
  └────────────────────────────────────────────────────┘
         │
         ▼
USER CLICKS "ASSIGN AGENT" → AI Agent generates fix →
User reviews diff → Approves → Goes live →
         │
         ▼
ML PERSONALIZES per visitor: serves the optimized
schema to each segment based on what ML learned
         │
         ▼
Data flows back to ML → Loop continues. Store gets
better every day without the merchant doing the work.
```

---

## How It's Different

| vs. | They Do | We Do |
|-----|---------|-------|
| **Shopify** | Static themes. Same page for every visitor. | AI generates different storefront per visitor. Enterprise features built in, not $50/mo per app. |
| **Shopify + Unbounce** | Landing pages have AI optimization. Store doesn't. | Store itself is AI-optimized. No separate tool needed. |
| **Optimizely** | Enterprise CMS + experimentation + commerce add-on. Requires 10-person team. $50k-500k+/yr. | Same capabilities. Open source. One person can run it. $99-299/mo. |
| **Webflow** | Visual builder. Static output. | AI generates + optimizes continuously. Visual editing is optional. |
| **Bolt / v0** | AI writes code once. Shipped = done. | AI generates AND continuously optimizes live. Per-visitor adaptation. |
| **Dynamic Yield** | Content swap within fixed layouts. Enterprise pricing. | Generates the layout itself per context. Affordable for any store. |
| **Stan.Store / Gumroad** | Same static page for every visitor. No optimization. | Per-visitor adaptation. Built-in A/B testing, ML, personalization. |

---

## One Platform Replaces 7 Tools

The current store stack requires stitching together multiple tools — each with its own login, billing, data model, and integration. Our platform replaces them all with one server.

| Tool | What it does | Replaced by |
|------|-------------|-------------|
| **Shopify / WooCommerce** | Commerce (products, cart, checkout) | Built-in commerce engine |
| **WordPress / Contentful** | CMS (pages, blog, content) | Built-in CMS + GrapesJS editor |
| **Google Analytics / Mixpanel** | Analytics | Built-in schema-attributed analytics |
| **HotJar / FullStory** | Observability (heatmaps, sessions, funnels) | Built-in ML insights dashboard |
| **VWO / Optimizely** | A/B testing + personalization | Built-in bandit optimization |
| **Unbounce / Instapage** | Landing page optimization | Built-in per-visitor AI generation |
| **Jasper / Copy.ai** | AI content generation | Built-in AI agents |

**The problem with separate tools**: Your data is fragmented across 7 silos. "Which layout variant did this visitor see when they dropped off?" — impossible to answer when analytics, testing, and store are different tools.

**The advantage of built-in**: Every event carries schema ID + variant ID + context hash. Attribution is exact. ML connects directly to experiments. Insights surface in the same dashboard where you assign agents to fix them. No data joins. No CSV exports. No "let me check the other tool."

---

## How It Works (Technical)

The UI is JSON. Not HTML. Not code. AI generates a semantic JSON schema describing layout, content, and workflow logic. An open source renderer (json-render, Vercel-backed, Apache 2.0) maps that JSON to pixels.

```
Visitor arrives → Context engine reads signals (device, referrer, segment, location)
       │
       ▼
Segment lookup → Cached JSON for this segment? → Hit? Return in <20ms
       │                                          Miss?
       ▼
AI generates per-visitor JSON schema (layout + content + workflow logic)
       │
       ▼
Validator checks: brand rules, accessibility, commerce constraints
       │
       ▼
Edge CDN delivers JSON in <50ms → json-render maps to React/Vue/etc components
       │
       ▼
Visitor interacts → Every click attributed to exact JSON schema + variant
       │
       ▼
ML feedback loop → Model retrains → Better schemas next time
```

### Why JSON + json-render (not direct code generation)

| Concern | JSON approach | Direct code (JSX) approach |
|---------|--------------|---------------------------|
| AI reliability | LLMs output valid JSON ~99.5%. Schema-validatable before render. | LLMs generate valid JSX ~80%. Syntax errors crash the page. |
| Multi-platform | Same JSON → React, Vue, RN, Flutter, Email, PDF | Must regenerate per platform |
| Edge caching | 2-5KB per schema. Cacheable. Diff patches ~200 bytes. | 20-50KB HTML. Hard to cache per visitor. |
| Visual editing | JSON tree maps 1:1 to drag-drop UI | Needs AST parser to reverse-engineer rendered code |
| Rollback | Store and diff JSON documents. Instant rollback. | Needs git. Slow. |
| Attribution | Every node has an ID. Exact schema → conversion tracking. | Manual instrumentation needed. |

### Can AI build better than humans?

- **Initial design**: No. A professional designer creates a better first draft. AI is adequate.
- **Optimization over time**: Yes, decisively. AI runs 1000s of simultaneous A/B tests across every store on the platform. No human team competes.
- **Per-visitor personalization**: Yes, by definition. A human can't redesign a store for each visitor segment. AI can.
- **The real advantage**: Not "AI is a better designer." It's "AI is a better optimizer + personalizer." The store improves every day automatically.

---

## Open Source + Managed Service

Like WordPress: open source core anyone can run, paid managed service on top.

```
OPEN SOURCE SERVER (Free)
  One repo. `docker compose up`. Full store.
  Modify the code. Add features. Your data. Your server.
  Anyone can use it, modify it, extend it.

MANAGED SERVICE (Paid, $99-299/mo)
  We host. We optimize. We manage AI agents for you.
  Enterprise features without enterprise price or team.
  Shopify integration or standalone mode.
```

---

## Quick Links

| Document | What It Covers |
|----------|---------------|
| [PRODUCT.md](PRODUCT.md) | Product principles, features, competitive comparison, revenue model |
| [POSITIONING.md](POSITIONING.md) | What we are, what we're not, vertical strategy |
| [OVERVIEW.md](OVERVIEW.md) | Detailed platform overview, user journeys, key concepts |
| [TECH.md](TECH.md) | Technical architecture, json-render integration, data flows, stack |
| [ROADMAP.md](ROADMAP.md) | Development phases, milestones, hiring, decisions log |
| [DIFFERENTIATION.md](DIFFERENTIATION.md) | What we build vs. what we use — 90% existing infrastructure, 10% differentiated AI |
| [FINDINGS.md](FINDINGS.md) | Complete analysis: market research, competitive corrections, architectural decisions, go-to-market strategy |
| [STRESS_TEST.md](STRESS_TEST.md) | Architecture stress test — building auth, rate limiting, and complex backend entirely on our platform |
| [STACK.md](STACK.md) | Complete reference of every technology, database, service, and tool in our system — what we build vs. what we integrate |

---

## One Line

**Open source platform with AI-manageable agents — every visitor gets an enterprise-optimized experience, and you control the AI.**



