# What We Build vs. What We Use

**We don't rebuild the internet. We build the AI layer that makes any site smarter than any single tool can.**

> **Framing — "commerce"/"storefront" are example verticals, not the product.** "Commerce" is used here as a concrete illustration. The platform is **identity-agnostic** and applies equally to booking, membership, SaaS, content, and any other use case. Commerce is the first vertical we validate against, not the platform's identity.


---

## The Principle: 90% Existing, 10% Differentiated

The boring parts of commerce â€” payments, tax, shipping, auth, hosting, fraud â€” are already solved by mature infrastructure. We use them. We only build what creates competitive advantage.

---

## What We USE (Existing Infrastructure)

| Capability | What we use | Why not build |
|-----------|------------|--------------|
| **Payments** | Stripe (Elements + Checkout) | PCI compliance is expensive and risky. Stripe handles 40+ payment methods, fraud (Radar), receipts, refunds, multi-currency, tax calculation (Stripe Tax). We load Stripe Elements into our JSON-rendered checkout â€” it looks like our storefront, but Stripe handles the money. |
| **Tax calculation** | Stripe Tax / TaxJar | Tax nexus tracking across 10,000+ US jurisdictions is a full-time legal problem. Existing APIs solve it. |
| **Shipping** | Shippo / EasyPost / ShipStation | Carrier integrations (UPS, FedEx, USPS, DHL) are a maintenance nightmare. Existing APIs have already done the integration work. |
| **Auth / accounts** | Clerk / Lucia / Auth0 | Password hashing, session management, SSO, social login â€” not a differentiation. Use existing. |
| **Bot protection** | Cloudflare | DDoS protection, bot management, WAF. Cloudflare does it better than we ever could. |
| **Hosting** | Cloudflare Workers + R2 | Edge workers for sub-50ms delivery. Zero egress fees for media. We run the server, they run the infra. |
| **Rendering** | json-render at edge + client | JSON â†’ components is solved. 15k stars, Apache 2.0, Vercel-backed. Supports React, Vue, Svelte, RN, Flutter. We add commerce components to its catalog. |
| **Visual editor** | GrapesJS (open source) | Drag-drop to JSON is solved. Mature, extensible. We integrate and theme it. |
| **AI models** | OpenAI + Claude + fine-tuned open models | No single vendor dependency. Different models for different tasks. We abstract the LLM layer so models are swappable. |
| **Shopify backend** (optional) | Shopify Storefront API + Admin API | For stores that already have Shopify. We replace only the frontend. Zero migration. They keep checkout, taxes, shipping, orders, emails, refunds. Note: Shopify Hydrogen + Oxygen already provides edge delivery â€” but requires a custom React project (2-6 months). Our approach gives the same edge benefits with a 30-minute app install. |

---

## What We BUILD (Differentiation)

| What | Why we build it | Competitors |
|------|---------------|-------------|
| **AI Storefront Generation** | LLM prompts â†’ valid JSON schema. The core AI engine that takes a description and generates a complete storefront. | Nobody does this. Unbounce routes to pre-built variants. Optimizely generates content, not layouts. |
| **Context Engine** | Real-time visitor signals (device, referrer, location, browser, segment) â†’ determines which JSON schema to serve. | Dynamic Yield does content targeting within fixed layouts. We generate the layout itself per context. |
| **Per-Visitor Layout Personalization** | Different component tree per visitor. Not "swap the hero image" â€” different hero, different grid, different CTA, different flow, all generated per session. | Nosto: fills pre-defined slots with personalized content. Same slot structure for everyone. We generate the slot structure itself per visitor. Dynamic Yield ($80k+/yr): swaps content within fixed layouts. |
| **AI Agent Manager** | Human-in-the-loop AI. Merchant assigns tasks ("optimize my mobile checkout"), AI generates solutions, merchant reviews and approves. Nothing goes live without approval. | Nobody does this. Optimizely Opal does marketing agents only. No other platform has commerce AI agents you manage. |
| **ML Feedback Loop + Insights** | Every click attributed to exact schema ID. ML runs experiments, surfaces visual insights ("your mobile checkout drops 40%"), merchant assigns agent with one click. | VWO/Optimizely have testing. HotJar has heatmaps. None connect insights to AI agents in one system. |
| **Schema-Level Attribution** | Every JSON node has a traceable ID. Every conversion is attributed to the exact variant + context that produced it. | Google Analytics attributes to pages. We attribute to the component level within each variant. |
| **Built-in Feature Flags** | Native context-aware flag evaluation for progressive rollouts, payment method toggles, and layout variants — all in the same data model. | LaunchDarkly, Flagsmith, Unleash are separate services with separate billing. No context engine, no A/B bandit integration, no AI-generated flag definitions. |
| **Unified Data Model** | Commerce, CMS, analytics, experiments, personalization share one data model. No data joins. No CSV exports. No "let me check the other tool." | Every existing platform silos data across separate tools. |
| **JSON-Validated Safety** | All AI output validated against typed schema before render. Bad JSON rejected, not displayed. No hallucination reaches a customer. | Bolt/v0 generate code directly â€” syntax errors crash the page. No validation layer. |

---

## The Cost of Building vs. Using

| If we built everything ourselves | With our approach |
|---------------------------------|-------------------|
| 5+ years to launch | 3-6 months to launch |
| 20+ engineers needed | 2-3 engineers needed |
| Millions in infra + compliance | Thousands in API fees |
| Endless maintenance | Vendor handles boring updates |
| One mistake in tax/PII = lawsuit | Stripe/Cloudflare handle liability |

---

## The Architecture Stack

```
BUILT BY US (Differentiation):
  â”œâ”€â”€ AI Generation Pipeline (prompt â†’ JSON)
  â”œâ”€â”€ Context Engine (signals â†’ segment)
  â”œâ”€â”€ AI Agent Manager (assign â†’ review â†’ approve)
  â”œâ”€â”€ ML Feedback Loop (data â†’ experiments â†’ insights)
  â”œâ”€â”€ Schema-Level Attribution (every node traceable)
  â””â”€â”€ Commerce Component Catalog (for json-render)

USED FROM EXISTING:
  â”œâ”€â”€ Payment processing â†’ Stripe (Elements + Tax + Radar)
  â”œâ”€â”€ Shipping â†’ Shippo / EasyPost
  â”œâ”€â”€ Auth â†’ Clerk / Auth0
  â”œâ”€â”€ Hosting + Edge â†’ Cloudflare (Workers + R2)
  â”œâ”€â”€ Renderer â†’ json-render (React, Vue, RN, etc.)
  â”œâ”€â”€ Visual Editor â†’ GrapesJS
  â”œâ”€â”€ AI Models â†’ OpenAI / Claude / fine-tuned
  â””â”€â”€ Backend (optional) â†’ Shopify Storefront API
```

---

## Summary

| Layer | Build or Use | Why |
|-------|------------|-----|
| AI generates storefront | **Build** | This is the product. |
| AI agents you manage | **Build** | Differentiated. Nobody does human-in-the-loop commerce AI. |
| ML optimization + insights | **Build** | Differentiated. Connects data â†’ experiments â†’ agents. |
| Analytics + attribution | **Build** | Differentiated. Schema-level. Enables the ML loop. |
| Checkout UI | **Use** (Stripe Elements in our JSON) | Stripe handles PCI, fraud, methods. We handle the UI. |
| Tax, shipping, auth | **Use** | Mature APIs exist. No advantage in rebuilding. |
| Renderer (JSON â†’ components) | **Use** (json-render) | 15k stars, multi-platform, Apache 2.0. No advantage in rebuilding. |
| Visual editor (drag-drop) | **Use** (GrapesJS) | Mature, open source, JSON output. No advantage in rebuilding. |
| Hosting, CDN, edge | **Use** (Cloudflare) | Sub-50ms global, zero egress, Workers. Don't build infrastructure. |
| Payments | **Use** (Stripe) | PCI, fraud, 40+ methods, global. Don't touch liability. |

---

## Corrections & Nuances (Findings From Analysis)

### Nosto: More Than Product Recommendations

Nosto can personalize hero/banner images, text content, CTAs, HTML blocks, category pages, and even product page content â€” IF the merchant builds "placements" into their theme template first. It's not just recommendations.

**The real difference**: Nosto fills pre-defined slots with personalized content. The SLOT STRUCTURE (layout) is the same for every visitor. We generate the slot structure itself per visitor. This is content personalization vs. layout personalization â€” different levels of optimization entirely.

### Shopify Hydrogen + Oxygen: Edge Delivery Exists

Shopify Hydrogen (React headless framework) + Oxygen (global edge hosting on Cloudflare Workers) already provides edge SSR, sub-50ms delivery, and edge caching â€” the same technology we use.

**Why this doesn't change our approach**:
- Hydrogen requires a custom React project: 2-6 months development by a skilled React developer
- 95%+ of Shopify stores use Liquid themes, not Hydrogen
- Our solution: 30-minute app install, same edge benefits, no developer required
- Our AI personalization + agents + ML feedback loop â€” Hydrogen doesn't provide any of this

**Our advantage isn't technology. It's accessibility.** Shopify already has edge infrastructure (Oxygen). But most stores can't use it because they don't have React developers. We package the same edge benefits + AI personalization into a 30-minute app install.

### Speed vs. Nosto

Both Nosto and we use Shopify Storefront API + client-side rendering. The difference:
- Nosto: injects JS into Shopify's Liquid-rendered page. Liquid renders first (300-500ms), then Nosto swaps content (100-200ms). Total: 400-700ms.
- Our app block: Shopify renders header/footer via Liquid (100-200ms), our block fetches JSON from edge (<20ms), json-render renders (50ms). Total: ~200-300ms. Faster because our block doesn't wait for Liquid to render the full page first.
- Our full headless: Edge SSR <50ms total. Significantly faster.

