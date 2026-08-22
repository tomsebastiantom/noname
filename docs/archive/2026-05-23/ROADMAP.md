# Development Roadmap
## Phases, Milestones & Deliverables

---

> **Framing — "commerce" is an example vertical, not the product.** This roadmap uses commerce (storefronts, checkout, carts, orders) as a concrete illustration of the phases. The platform is **identity-agnostic**: the same engines and domains power booking, membership, SaaS, content, and any other use case. Commerce is the first vertical we validate against, not the platform's identity.

## Phase 0: Foundation (Weeks 1-6)
**Goal**: One open source server that generates a valid storefront, processes a checkout, and lets a merchant manage AI agents — working as both Shopify mode and standalone mode.

### Deliverables

| # | Deliverable | Description | Week |
|---|------------|-------------|------|
| 0.1 | **Server Scaffold** | Node.js + Postgres + Redis. Single deployable codebase. Auth, multi-tenant, admin dashboard. | 1-2 |
| 0.2 | **json-render Integration** | Set up json-render catalog with base commerce components (ProductCard, AddToCart, CheckoutButton, CartDrawer). Render existing JSON specs. | 1-2 |
| 0.3 | **CMS Engine** | Content management: pages, products, media. Admin UI. **Custom inline visual editor** (not GrapesJS). | 2-4 |
| 0.4 | **AI Generation Pipeline v0.1** | LLM prompt → structured JSON output (compatible with json-render spec). Works for simple storefronts. | 2-4 |
| 0.5 | **Commerce Engine** | Cart, checkout (Stripe Connect for standalone), order management. Shopify adapter for Shopify mode. | 3-5 |
| 0.6 | **Context Engine v0.1** | Reads device type, locale, referrer → maps to segment → passes to AI | 4-6 |
| 0.7 | **AI Agent Manager v0.1** | Task assignment, AI execution, review/approval workflow. First agent: "optimize this page." | 5-6 |
| 0.8 | **Demo Store** | A fully working store: AI generates a storefront, visitor sees it, can buy a product | 5-6 |

### Key Changes from Original Plan
- **No custom JSON Schema spec** — adopt json-render's existing spec
- **No custom renderer** — integrate json-render (open source, Vercel-backed)
- **No GrapesJS** — **replaced by custom inline visual editor** (Shopify Theme Editor style, substantially built in `packages/client/src/editor/`)
- **Added**: AI Agent Manager (the core differentiator)
- **Added**: Dual-path architecture (Shopify adapter + Stripe Connect standalone)
- **Compressed**: 8 weeks → 6 weeks (reusing existing open source)

### Success Criteria
- [ ] AI generates valid JSON (json-render spec) for 5 different store types
- [ ] json-render produces working UI from that JSON without manual fixes
- [ ] A real visitor can add to cart and checkout (in both Shopify and standalone modes)
- [ ] Context engine serves different schemas to mobile vs. desktop
- [ ] AI agent can accept a task, generate a variant, and show it for merchant approval
- [ ] End-to-end latency <500ms for cached schemas

### Who This Is For
Internal team only. No external users. Proves the architecture works.

---

## Phase 1: Launch (Weeks 7-18)
**Goal**: Launch to real stores. A merchant can sign up, connect their Shopify or start fresh, manage AI agents, and start selling.

### Deliverables

| # | Deliverable | Description | Week |
|---|------------|-------------|------|
| 1.1 | **Onboarding Flow** | Sign up → connect Shopify (or set up standalone) → AI generates store → publish | 7-9 |
| 1.2 | **Store Dashboard** | View products, orders, analytics, AI agent tasks | 8-10 |
| 1.3 | **Product Management** | Add/edit products; AI agent generates descriptions from photos on request | 9-11 |
| 1.4 | **Custom Domain** | One-click custom domain with SSL | 10-11 |
| 1.5 | **Shareable Link** | `yourstore.com` or `platform.com/your-store` | 7-8 |
| 1.6 | **Shopify App Store Launch** | Package as Shopify app. Connect via OAuth. Replace frontend. | 10-13 |
| 1.7 | **AI Agent Dashboard v0.1** | Assign tasks, view results, approve/reject. 3 built-in agent types: Optimize, Generate, Analyze. | 11-14 |
| 1.8 | **Basic Analytics** | Visitors, conversion rate, revenue, top products | 12-14 |
| 1.9 | **Edge Delivery v0.1** | CDN caching of JSON schemas; basic Cloudflare Worker | 13-15 |
| 1.10 | **Mobile-First Rendering** | All generated stores optimized for mobile by default (via json-render) | 9-12 |
| 1.11 | **Pricing & Billing** | Free + Starter + Pro tiers; billing via Stripe | 15-18 |

### Success Criteria
- [ ] 50 paying stores on the platform (Shopify mode + standalone mode)
- [ ] Average time from sign-up to published store < 15 minutes
- [ ] AI agents complete 200+ tasks with >80% approval rate
- [ ] Stores using our Shopify mode see measurable 5%+ conversion lift
- [ ] First $5k MRR achieved

### Who This Is For
DTC brands on Shopify (Shopify mode). Small store owners who want everything in one place (standalone mode).

---

## Phase 2: Intelligence (Weeks 19-34)
**Goal**: The platform gets smart. AI agents offer more capabilities. ML optimization makes every store better automatically.

### Deliverables

| # | Deliverable | Description | Week |
|---|------------|-------------|------|
| 2.1 | **A/B Testing Engine** | AI agents generate layout variants; multi-armed bandit routes traffic | 19-22 |
| 2.2 | **Per-Visitor Personalization** | Different JSON schema served to different visitor segments | 20-24 |
| 2.3 | **Edge ML Inference** | Lightweight models at CDN edge for sub-50ms personalization decisions | 22-26 |
| 2.4 | **JSON Diff Protocol** | Use json-render's built-in `diffToPatches()` (RFC 6902) and SpecStream — client receives only changed patches, not full re-render. Reuse, not build. | 23-25 |
| 2.5 | **AI Agent Library (v1)** | Pre-built agent types: SEO optimizer, checkout optimizer, content writer, comparison page generator, drop-off analyzer | 24-30 |
| 2.6 | **Visual CMS (v1)** | GrapesJS drag-drop editor fully integrated. Live preview. AI co-pilot. | 24-30 |
| 2.7 | **i18n & Localization** | Locale-aware schema generation; RTL; cultural layout adaptation | 28-32 |
| 2.8 | **Schema Telemetry** | Every JSON node traceable; analytics knows which schema drove which conversion | 25-29 |
| 2.9 | **ML Feedback Loop (v1)** | Events → feature store → model retrain → better schemas | 28-34 |

### Success Criteria
- [ ] A/B testing produces statistically significant winners for 50%+ of stores with >500 visitors/week
- [ ] Per-visitor personalization increases conversion rate by 15%+ vs. static layout
- [ ] Edge delivery: 90th percentile latency <50ms globally
- [ ] Visual CMS: a non-technical merchant can edit their store without AI chat
- [ ] i18n: One store live in 3+ locales with different layouts per locale
- [ ] AI agents complete 1000+ tasks with >90% approval rate

### Who This Is For
Scaling DTC brands. Multi-product stores. Agencies managing client stores.

---

## Phase 3: Scale (Weeks 35-50)
**Goal**: Advanced commerce features. Open source community launch. Platform becomes viable for larger stores.

### Deliverables

| # | Deliverable | Description | Week |
|---|------------|-------------|------|
| 3.1 | **DTC Brand Templates** | Schema libraries for fashion, beauty, food, electronics | 35-38 |
| 3.2 | **Advanced Commerce** | Dynamic bundles, cross-sells, inventory intelligence, multi-currency | 36-41 |
| 3.3 | **Visual CMS (v2)** | Role-based editing (developer, marketer, translator, AI agent) | 38-42 |
| 3.4 | **Self-Healing UI** | Components request AI fallback when data sources fail | 40-44 |
| 3.5 | **Marketplace Support** | Multi-vendor stores; each vendor gets AI-optimized micro-storefront | 42-48 |
| 3.6 | **Open Source Server Launch** | Publish the one-repo codebase on GitHub. Docker compose up. Full store. | 44-46 |
| 3.7 | **Plugin System (v1)** | Extend the server with plugins. Plugin marketplace. | 46-50 |
| 3.8 | **SDK & API** | Public API for schema generation, commerce, analytics | 38-44 |
| 3.9 | **B2B Commerce** | Net-30 invoicing, bulk pricing, approval workflows | 44-50 |

### Success Criteria
- [ ] 500 active stores on the platform
- [ ] $500k+ GMV processed monthly
- [ ] DTC brands report 20%+ higher conversion vs. their previous store
- [ ] Open source repo: 1,000+ GitHub stars
- [ ] 10+ community plugins submitted
- [ ] $50k+ MRR

### Who This Is For
Scaling DTC brands. Agencies. Multi-vendor marketplaces. B2B sellers.

---

## Phase 4: Ecosystem & Enterprise (Weeks 51-76)
**Goal**: Enterprise features. Global scale. Self-improving stores.

### Deliverables

| # | Deliverable | Description | Week |
|---|------------|-------------|------|
| 4.1 | **Enterprise Features** | SSO, RBAC, audit logs, SLA, dedicated support | 51-56 |
| 4.2 | **On-Premise Option** | Self-hosted server for regulated industries | 54-60 |
| 4.3 | **Custom AI Agents** | Fine-tuned per-store AI agents with custom instructions and guardrails | 56-62 |
| 4.4 | **Additional Renderers** | Flutter, Swift, Kotlin renderers (via json-render ecosystem) | 52-66 |
| 4.5 | **Advanced ML** | Transfer learning across stores; cross-vertical optimization | 58-68 |
| 4.6 | **White-Label** | Agencies fully white-label the platform for their clients | 62-68 |
| 4.7 | **Global Compliance** | GDPR, CCPA, LGPD, age gating, product regulations per market | 64-70 |
| 4.8 | **Self-Improving Mode** | "Set a KPI, AI agents manage optimization autonomously within your guardrails" | 68-76 |

### Success Criteria
- [ ] 5,000 active stores
- [ ] $10M+ GMV processed monthly
- [ ] 5+ enterprise contracts ($100k+ ACV)
- [ ] 50+ community extensions/plugins
- [ ] Platform available in 20+ locales
- [ ] Self-improving mode: stores with >10k visitors/week improve conversion by 5%+ monthly

---

## Timeline Visual

```
2026 Q3          Q4           2027 Q1         Q2          Q3          Q4
  │              │              │              │           │           │
  ├─ Phase 0 ───┤              │              │           │           │
  │ Foundation   │              │              │           │           │
  │              ├─ Phase 1 ───┤              │           │           │
  │              │  Launch     │              │           │           │
  │              │              ├─ Phase 2 ───┤           │           │
  │              │              │ Intelligence│           │           │
  │              │              │              ├─ Phase 3 ┤           │
  │              │              │              │  Scale    │           │
  │              │              │              │           ├─ Phase 4─┤
  │              │              │              │           │ Ecosystem│
  │              │              │              │           │ & Enter  │
```

---

## What We Build vs. What We Open Source

### Open Source (Free, Forever)

| Component | Why Open |
|-----------|---------|
| The entire server codebase | WordPress model: anyone can run it, modify it, extend it. Drives adoption. |
| Commerce component catalog (json-render) | Community builds more commerce components. Ecosystem grows. |
| Plugin system | Third-party developers extend the platform. Marketplace revenue share. |

### Managed Service (Paid)

| Component | Why Paid |
|-----------|---------|
| Managed hosting + infrastructure | Convenience. You run the server for them. |
| AI agent execution (LLM calls) | Expensive to run. Per-task credits or included in subscription. |
| Edge delivery infrastructure | CDN + Workers cost money at scale. |
| Enterprise features (SSO, RBAC, SLA) | Enterprise value-add. |
| Premium AI agents (custom-trained) | Differentiation. Higher-tier plans. |

### Revenue Projection

| Phase | Stores | Avg Monthly Rev/Store | Platform Monthly Rev | GMV (Monthly) |
|-------|--------|-----------------------|---------------------|---------------|
| Phase 1 | 50 | $99 | $5k | $500k |
| Phase 2 | 200 | $149 | $30k | $2M |
| Phase 3 | 500 | $199 | $100k | $10M |
| Phase 4 | 5,000 | $249 | $1.25M | $50M |

Flat subscription pricing (no GMV fee). Enterprise contracts additional.

---

## Hiring Plan

| Role | Phase | Why |
|------|-------|-----|
| **Founding Engineer (Full Stack + AI)** | Phase 0 | Build the server: commerce engine, AI pipeline, json-render integration |
| **Founding Engineer (Full Stack + Frontend)** | Phase 0 | Build the CMS, admin UI, **inline visual editor**, Shopify app |
| **Product Designer** | Phase 1 | Design the AI agent workflow, onboarding flow, visual CMS |
| **Growth / Marketing** | Phase 1 | Shopify App Store launch; merchant acquisition |
| **Community Engineer** | Phase 2 | Open source community management; plugin system design |
| **Support / Success** | Phase 2 | Merchant onboarding and support |
| **Enterprise Sales** | Phase 4 | Large ACV deals |

---

## Key Decisions Log

| Decision | Options Considered | Decision | Rationale |
|----------|-------------------|----------|-----------|
| Build vs. integrate renderer | Build custom vs. integrate json-render vs. direct code gen | **Integrate json-render** | 15k stars, Apache 2.0, Vercel-backed. Supports 10+ platforms. Don't rebuild. |
| Build vs. integrate visual editor | Build custom vs. GrapesJS vs. Builder.io | **Build custom inline editor** | Shopify Theme Editor UX. Same components as visitor. Code-split. No separate canvas engine. |
| Schema format | Custom JSON vs. json-render spec vs. JSX | **json-render spec** | Adopt existing standard. No custom format to build and maintain. |
| First go-to-market | Shopify app only vs. standalone only vs. both | **Dual-path (both)** | Shopify app for distribution. Standalone for independence. Same server. |
| AI control model | Fully autonomous vs. human-in-the-loop vs. managed agents | **Manageable agents** | Human-in-the-loop. Seller assigns, AI does, seller approves. Builds trust. |
| Revenue model | GMV fee (like Shopify) vs. flat subscription | **Flat subscription** | Simpler for merchants. No transaction percentage. Predictable revenue. |
| Open source strategy | Multiple packages (renderer + schema) vs. one server | **One open server** | Like WordPress. Single deployable codebase. Less complexity, more adoption. |
| AI provider | OpenAI vs. Claude vs. fine-tuned vs. multi | **Multi** | No vendor dependency. Different models for different agent tasks. |
| Edge provider | Cloudflare vs. AWS vs. Fastly | **Cloudflare primary** | Fastest Workers cold start. R2 zero egress. Workers KV for caching. |

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| **AI generates bad layouts/content** | High | Medium | Strict schema validation via json-render catalog. Human approval gate on all agent output. Brand constraint system. |
| **LLM costs too high at scale** | Medium | High | Cache 90%+ at edge. Fine-tune smaller models. Open model fallback. Per-task pricing for heavy AI users. |
| **Merchants don't adopt** | Medium | Critical | Shopify App Store distribution lowers barrier. Dual-path reduces switching cost. Concierge onboarding for first 20 stores. |
| **Shopify launches similar features** | High | Medium | They optimize within Liquid/CMS templates. We generate per-visitor layouts. Different paradigm. Also: standalone mode is unaffected. |
| **json-render goes in wrong direction** | Low | Medium | Apache 2.0 license — we can fork. Locked version in package.json. |
| **Open source fragments** | Medium | Low | One server repo is the canonical version. Plugins extend it. Fragmentation is a feature, not a bug (like WordPress). |
| **Regulatory compliance** | Low | High | Auto-generate compliance components per region. Hire compliance counsel in Phase 3. |
| **Payment fraud** | Medium | Medium | Stripe handles fraud. Shopify mode inherits Shopify's fraud detection. Standalone mode adds platform-level rules. |

---

## Summary

| Phase | Timeline | Focus | Key Metric |
|-------|----------|-------|------------|
| **0: Foundation** | Weeks 1-6 | Open server with json-render, commerce, AI agents | Demo store live |
| **1: Launch** | Weeks 7-18 | Shopify app + standalone launch. Paying stores. | 50 stores, $5k MRR |
| **2: Intelligence** | Weeks 19-34 | AI agents, A/B testing, personalization, ML feedback | 15%+ conversion lift |
| **3: Scale** | Weeks 35-50 | Advanced commerce, open source server, plugins | 500 stores, $100k MRR |
| **4: Ecosystem** | Weeks 51-76 | Enterprise, global, self-improving stores | 5,000 stores, $1.25M MRR |
