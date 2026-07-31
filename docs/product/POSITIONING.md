# Positioning: What We Actually Are

## In One Sentence

**Open source AI platform — CMS, per-visitor site experiences, enterprise features, and AI agents you manage, all built into one server that replaces 7 separate tools.**

Not a renderer. Not a spec. Not a "landing page tool." Not an "enterprise CMS." One server that replaces CMS + commerce (as one example vertical) + analytics + observability + A/B testing + personalization + AI agents — all built in because they share one data model. Any site gets what only Fortune 500 companies could previously afford.

> **Framing — "commerce" is an example vertical, not the product.** This document uses commerce/storefronts to illustrate the platform. The platform is **identity-agnostic**: the same engines and domains power booking, membership, SaaS, content, and any other use case. Commerce is the first vertical we validate against — not the platform's identity.

---

## The Core Platform

```
┌──────────────────────────────────────────────────────────┐
│              ONE OPEN SOURCE SERVER                        │
│              (Deploy anywhere. Modify freely.)              │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  CMS               AI Agents        Storefront           │
│  (Pages,           (You assign.     (Per visitor,        │
│   products,         AI does.         per session,        │
│   media,            You review.)     optimized by ML)    │
│   blog)                                                   │
│                                                           │
│  Commerce           Enterprise       Open Extensions     │
│  (Cart, checkout,   Features         (Plugin system,     │
│   payments,         (A/B testing,    custom components,  │
│   subscriptions,    analytics,       API, SDK)           │
│   inventory)        personalization)                      │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

---

## The Problem

| Existing tools optimize | But nobody optimizes |
|------------------------|---------------------|
| Facebook Ads AI → ad targeting per user | The storefront the ad clicks through to |
| Google Ads AI → keyword bidding | The storefront the search ad lands on |
| Unbounce Smart Traffic → landing page routing | The checkout flow after the landing page |
| Optimizely → enterprise marketing campaigns | The product page and cart for every visitor |

**The storefront is the last unoptimized mile in ecommerce.** Every ad tool personalizes who sees your ad. Nobody personalizes what they see when they get there.

---

## How We Solve It

```
1. Seller sets up their store (or connects existing Shopify)
   The server provides: CMS, products, checkout, everything.

2. Seller manages AI agents like team members
   "Optimize this page for mobile." "Generate A/B test variants."
   "Write FAQ content." "Find why cart abandonment is high."
   AI does the work. Seller reviews and approves.

3. Every visitor gets a personalized storefront
   Context engine reads: device, referrer, location, past behavior.
   AI generates a different layout, content, and flow per visitor.
   Same URL. Different experience. Optimized by ML over time.

4. ML feedback loop improves everything automatically
   Every click, every conversion attributed to the exact schema.
   Model retrains daily. Better variants. Higher conversion.
```

---

## What We Are NOT

| What People Might Think | Why We're Different |
|------------------------|---------------------|
| "Shopify competitor" | Shopify is a back-office + theme store. We are an AI optimization layer. We integrate WITH Shopify or replace the frontend. Both work. |
| "Open source Shopify clone" | Shopify is a hosted SaaS. We're an open server you can run anywhere. And we do per-visitor AI optimization — Shopify doesn't. |
| "Enterprise CMS like Optimizely" | Optimizely requires a 10-person marketing ops team and $50k+/yr. Their commerce is an acquired add-on. Our commerce is native. Our price is $99-299/mo. |
| "Landing page tool like Unbounce" | Unbounce optimizes PPC landing pages — no commerce, no checkout, no cart. We optimize the entire store, including checkout. |
| "AI code generator like Bolt/v0" | They generate static code once. We generate AND continuously optimize. They have no commerce. We're use-case-native (commerce as first example). |
| "No-code/low-code platform" | You don't build. You describe. AI generates. You manage AI agents. The visual editor is for tweaking, not building from scratch. |
| "Personalization tool like Dynamic Yield" | They swap content within fixed layouts at enterprise pricing. We generate the layout itself per visitor at affordable pricing. |

---

## Dual-Path Strategy

The same platform works two ways:

```
SHOPIFY MODE:
  Store keeps Shopify backend (products, orders, payments).
  Our server replaces ONLY the storefront.
  Shopify App Store for distribution.
  $99-299/mo for AI optimization.

STANDALONE MODE:
  Our server handles everything (CMS, products, cart, checkout,
  payments via Stripe Connect, orders, subscriptions).
  Independent of any platform.
  $99-299/mo for the full stack.

Both modes share:
  - Same AI engine and ML feedback loop
  - Same json-render frontend
  - Same manageable AI agents
  - Same edge delivery infrastructure
  - Same open source codebase
```

This is stronger than either pure Shopify or pure standalone:
- **Shopify mode** → fast distribution, existing merchant trust
- **Standalone mode** → higher margins, no platform dependency
- **Both** → merchants can start on Shopify and migrate to standalone when they outgrow it

---

## The Gap We Fill

```
                    HAS COMMERCE?
                    YES              NO
         ┌──────────────────────────────────────┐
A/B     YES│   [GAP]            Unbounce,        │
TESTING +  │   noname fills     Instapage,       │
PER-       │                    VWO,             │
VISITOR    │   Commerce +       Dynamic Yield,   │
AI         │   AI storefront    Optimizely       │
           │   per visitor      (no commerce,    │
           │   Affordable       enterprise only) │
           ├──────────────────────────────────────┤
         NO│   Shopify,         WordPress,       │
           │   WooCommerce,     Webflow,         │
           │   BigCommerce      Framer           │
           │   (static themes,  (static sites,   │
           │   no AI per        no commerce)     │
           │   visitor)                          │
           └──────────────────────────────────────┘
```

**Nobody is in the top-left quadrant.** Landing page tools have AI per-visitor optimization but no commerce. Commerce platforms have checkout but no per-visitor AI optimization. Enterprise personalization tools are too expensive and commerce-blind.

---

## The Answer to "What Is It?"

### Short version:
An open source platform with CMS, AI-personalized experiences, and AI agents you manage — bringing enterprise optimization to any site.

### For store owners:
"Facebook optimizes your ads. We optimize what happens after the click. Every visitor gets a storefront designed for them. You decide what AI does. Works with your existing Shopify or standalone."

### For investors:
"Open source WordPress-like platform that replaces 7 separate tools (CMS + commerce (one example vertical) + analytics + observability + A/B testing + personalization + AI agents) in one server. Built-in, not stitched together. Every event shares one data model, so attribution is exact and ML connects directly to experiments. Revenue from managed hosting. Shopify integration for distribution. Open source for adoption."

### For developers:
"One open source server. Docker compose up. Full AI platform. Modify the code. Build plugins. Extend it. Or use our managed service."

---

## Summary

1. **Core**: Open source platform — CMS + AI experiences + enterprise features + manageable AI agents
2. **Go-to-market**: Dual-path (Shopify app for distribution, standalone for independence)
3. **Message**: "Your ads are personalized per visitor. Your store should be too."
4. **Differentiation**: Per-visitor layout generation (not content swap), use-case-native (not CMS add-on), manageable agents (not AI takeover), built-in feature flags (not separate tools), open source (no lock-in)
5. **Revenue**: Managed hosting ($99-499/mo) + enterprise contracts
