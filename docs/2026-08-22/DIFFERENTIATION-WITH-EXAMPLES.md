# Differentiation Deep-Dive — With Concrete Examples
## Per-Visitor Commerce: Exact Scenarios, Schemas, and Competitor Contrast
### As of 2026-08-22

---

## Why This Doc Exists

`2026-05-23/DIFFERENTIATION.md` states the build-vs-use thesis. This doc makes the differentiation **concrete**: for each differentiator, one real visitor scenario, what every competitor actually does today, and what our platform outputs (schema sketch). Use these as acceptance stories and sales demos.

---

## Differentiator 1: Per-Visitor Layout Generation (Not Content Swap)

### Scenario
Two visitors hit `/products/pro-yoga-mat` in the same minute:
- **A**: iPhone, first visit, UTM `ig-story`, 4G, portrait
- **B**: Desktop, 5th session, has 2 past orders, loyalty tier Gold

### What Competitors Do (verified behavior)
| Tool | Actual behavior |
|------|----------------|
| **Nosto** | Same theme slots; swaps hero image/product recs inside pre-built placements |
| **Dynamic Yield** | Content/offer swap within fixed templates; layout structure frozen |
| **Shopify** | One Liquid theme for everyone; "personalization" = apps injecting sections client-side |
| **Optimizely/VWO** | Routes between human-authored variants (max ~2-5, built weeks in advance) |

### What We Output
Same URL, two generated specs (sketches):

```jsonc
// Segment: mobile-first-visit (generated, cached by segmentHash)
{ "type": "hero",        "props": { "variant": "video-first", "src": "{{product.video}}",
                                    "cta": "Shop {{product.title}}", "urgency": "{{product.inventory < 8 ? 'Only ' + product.inventory + ' left' : null}}" } },
{ "type": "add-to-cart", "props": { "variant": "sticky-mobile", "enableApplePay": true },
  "$cond": "/context/device.isMobile" },
{ "type": "social-proof","props": { "source": "instagram" },          // IG traffic → IG proof
  "$cond": "/context.traffic.source == 'instagram'" }

// Segment: returning-gold-desktop
{ "type": "quick-reorder",   "props": { "pastOrderIds": "/user.recentOrders" } },
{ "type": "product-info",    "props": { "variant": "sidebar-specs" } }, // dense info layout
{ "type": "loyalty-banner",  "props": { "pointsToNextReward": "/user.pointsToReward" } }
```

**Demo proof point**: open the same URL from two devices → visibly different page structures, both traced (`schemaId`, `variantId`, `contextHash`) in analytics.

---

## Differentiator 2: Insights → One-Click Agent Assignment

### Scenario
ClickHouse shows PDP mobile funnel: gallery→price step loses 38% before AddToCart on screens <375px.

### Competitor reality
HotJar/FullStory: shows you the heatmap/recording. Then… you go fix it manually.
VWO/Optimizely: report the drop-off. Then… build the variant yourself.

### Our loop (all pieces exist or are specified)
1. Analytics domain detects anomaly (drop-off > threshold, segment-scoped)
2. **Insight card renders in admin**: funnel visualization + evidence
3. Button **[Fix this]** → creates agent task with structured context (funnel data, current PDP spec, brand constraints)
4. Mastra executor generates 3 variant specs; validator rejects schema violations
5. Merchant reviews diff in existing agent panel (approve/reject/undo already built)
6. Approved variant auto-enters bandit rotation via flags domain

No competitor connects detection→generation→approval→traffic-routing in one system at any price.

---

## Differentiator 3: Schema-Level Attribution (Exact Causality)

### The question no other platform can answer
*"Which exact component arrangement, shown to which segment, produced this $84 order?"*

### Example answer from our model
```
order #1042 ($84) ← checkout_completed event
  ← variantId: "pdp-v3" (sticky ATC above fold)
  ← schemaId: "pdp-pro-mat@v12"
  ← contextHash: "mobile-new-paid-social"
  ← exposedAt: 14:02:11Z, convertedAt: 14:07:53Z
```

GA4 attributes to page+campaign. Shopify attributes to session/referrer. **We attribute to the component tree itself** because the UI is data — every pixel descends from an addressable node.

---

## Differentiator 4: Dual-Path (Shopify Mode ↔ Standalone)

| | Shopify mode | Standalone mode |
|--|-------------|-----------------|
| Products/cart/orders source | Storefront API adapter | Our commerce domain (Stripe Connect) |
| What merchant keeps | Shopify back office, payments, shipping | Everything, full margin control |
| What we replace | Only the storefront layer | Nothing external — we are the stack |
| Migration story | Install app → publish AI storefront | Sign up → describe store → live |

**Example**: A $2M yoga apparel brand starts in Shopify mode (zero migration risk). Two years later they outgrow Shopify's fees → flip adapter flag → same storefront JSON now reads from our commerce domain. **The AI engine, layouts, experiments, attribution are byte-identical across the flip.**

---

## Differentiator 5: Built-In Experimentation With Generated Arms

Traditional CRO cost per test: developer codes variants (days), analyst sizes test (weeks), engineer deploys winner.

Our unit economics per test:
```
Merchant clicks [Generate variants]      0 min human
Agent generates N=3 valid specs          ~30s LLM time
Validation gate                          automatic (catalog schemas)
Approval                                 1 click
Bandit promotes winner                   continuous, automatic
Attribution                              exact (Differentiator 3)
```

Tests entire layout *structure* (not just headline copy), runs continuously across hundreds of micro-decisions, and never ships an unapproved change.

---

## Differentiator 6: Real-Time Collaborative Editing of Live Store

Already built (unique among all platforms surveyed):
- Merchant + marketer + AI agent edit the same PDP simultaneously (Yjs/Automerge rooms)
- Remote cursors, presence, agent-as-collaborator with approve/reject/undo
- Editor loads only for admins (`?edit=true`), same URL/components/catalog as visitors

Webflow/Shopyfi theme editor: single-editor locks. Figma: design-only, not the live store. **Nobody else edits the production storefront collaboratively with an AI participant.**

---

## Feature Parity Floor (What We Must Also Have to Be Taken Seriously)

Differentiation gets attention; **parity closes deals**. From platform research, the minimum credible set beyond Phase 0:

| Area | Minimum bar (Phase 1–2) | Reference standard |
|------|------------------------|--------------------|
| Search | Autocomplete, typo tolerance, facet filters | Algolia-level UX |
| Payments | Cards, wallets (Apple/Google Pay), BNPL flag | Stripe defaults |
| Emails | Order confirmation, shipping, abandoned cart, win-back | Klaviyo basics |
| SEO | SSR/bot HTML, sitemaps, structured data, canonicals | Shopify baseline |
| i18n | Multi-currency display, locale routes, RTL-ready | Shopify Markets-lite |
| Discounts | Codes, auto discounts, BOGO, free-shipping threshold | WooCommerce parity |
| Shipping | Flat/rate-by-weight, live rates via EasyPost-class API | Shippo parity |
| Admin | Orders list w/ fulfillment + refund flows | Shopify orders-lite |

---

## Positioning One-Liners (Per Audience)

- **Merchant (DTC)**: "Your ads personalize who sees them. We personalize what they land on — and the AI that does it works for you, reviewed by you."
- **Agency**: "Run 50 client stores on one open server; white-label included; your juniors become AI-supervising seniors."
- **Developer**: "One deployable server. UI is validated JSON, workflows are XState, integrations via Nango. Fork it, extend it, own it."
- **Investor**: "WordPress distribution economics + Optimizely-grade optimization + an agent workforce — priced at $99, not $50k."

---

## Evidence Checklist (What Would Prove Each Claim)

| Claim | Proof artifact to produce |
|-------|--------------------------|
| Per-visitor generation | Side-by-side device recording, same URL |
| Insight→agent loop | Screen capture: insight card → [Fix this] → approved variant live |
| Attribution | ClickHouse query joining order # → component path |
| Dual-path flip | Demo: toggle adapter, storefront unchanged, data source changes |
| Collab + agent editor | Two cursors + agent proposal resolved in one session |
