# AI & Agentic Commerce — Future Plans
## Where the Industry Is Going and How This Platform Wins It
### As of 2026-08-22 (Research-Based)

---

## Part 1: What Changed in the Industry (2025–2026 Research)

The commerce industry crossed a threshold: **AI is no longer a feature inside stores — AI is becoming a shopping channel that sits outside stores.** Three protocol-level standards plus platform moves define the new battlefield:

### 1.1 The Agentic Commerce Protocols

| Protocol | Backers | What it does | Status (verified 2026-08) |
|----------|---------|--------------|---------------------------|
| **UCP (Universal Commerce Protocol)** | Google + Shopify (open source) | The consolidating standard for agent-ready stores: products, carts, checkout, discounts, fulfillment exposed as discoverable, negotiable capabilities at `/.well-known/ucp`. Shopify's Catalog API is its discovery layer; ECP (Embedded Commerce Protocol, born from Checkout Kit) renders the merchant's own checkout inside agent surfaces. | Spec public (`v2026-01-11`, ucp.dev); Tech Council includes Amazon, Meta, Microsoft, Salesforce, Stripe, Etsy, Target, Wayfair; Shopify Spring '26 opened it to every developer |
| **ACP (Agentic Commerce Protocol)** | OpenAI + Stripe (+ PayPal) | Delegated checkout with Shared Payment Tokens; merchant of record stays the seller. Its flagship deployment, ChatGPT Instant Checkout, was **shut down March 2026** after near-zero merchant adoption (~12–30 Shopify stores ever live); ChatGPT pivoted to a discovery-first model. | Spec alive (Beta `2026-04-17`) and adopted by **Microsoft Copilot Checkout** (live in-chat checkout, US, Jan 2026) — treat as a secondary rail, not the primary target |
| **AP2 (Agent Payments Protocol)** | Google + Coinbase + Mastercard + 60+ | Cryptographic "mandates" proving a human authorized an agent's purchase (intent/cart/payment mandates) — solves non-repudiation for agent-initiated payments. Composes underneath UCP/ACP as the trust layer. | v0.2 (adds human-not-present payments); donated to the **FIDO Alliance** (Apr 2026); FIDO working groups chaired by Mastercard/Visa and CVS Health/Google/OpenAI |

**Lesson from the ACP shake-out**: in-chat checkout without merchant flexibility failed commercially — discovery and execution are two different problems. The durable layer is what all three protocols need anyway, and what our architecture already produces: **structured, machine-readable product data and machine-composable commerce actions.** A JSON-native store is one `/.well-known/ucp` manifest away from agent-addressability. A Liquid/PHP store is not.

### 1.2 Platform Moves

| Platform | Move | Signal |
|----------|------|--------|
| **Shopify** | Co-developed UCP with Google; **Catalog API** syndicates structured listings to ChatGPT/Copilot/Google AI Mode/Shop app (Catalog-powered AI search converts ~2x vs scraped data); **Agentic Storefronts** control plane; Spring '26 removed the approval gate for agentic developers | Shopify is repositioning from storefront host → **commerce rails for AI surfaces** |
| **Microsoft** | **Copilot Checkout** (Jan 2026): live in-chat checkout on ACP with PayPal/Stripe/Etsy; Shopify merchants auto-enrolled; **Brand Agents** deploy brand-voice AI shopping assistants on merchant sites | Post-shutdown, Microsoft operates the largest live in-chat checkout surface |
| **Amazon** | Rufus retired (May 2026), merged into **Alexa for Shopping**: Auto-Buy, Scheduled Actions, cross-retailer **Buy for Me**, Shop Direct; agentic seller ops | Discovery is shifting from keyword search → **intent conversation** — and agents now complete purchases off-platform |
| **Google** | Agentic checkout (Nov 2025): price-watch → **"Buy for me"** executes on the merchant site; Universal Cart; AI Mode shopping; virtual try-on | Checkout itself becomes delegable across the open web |
| **Perplexity** | In-assistant product cards + buy; zero merchant fees | New traffic sources with zero storefront visits |

### 1.3 The Strategic Consequence for Us

Two futures exist for every merchant:

```
FUTURE A (passive):  Merchant's store gets scraped/syndicated by assistants.
                     Margins compress; brand becomes a SKU row in ChatGPT.

FUTURE B (active):   Merchant runs an AI-NATIVE store that:
                     - Is fully legible to external agents (UCP read-side, ACP/Copilot sell-side)
                     - Fights back with per-visitor generation when humans DO visit
                     - Deploys its OWN agents as staff (ops, content, optimization)
```

Our platform is uniquely positioned for Future B because the hard part of both ACP/UCP compliance AND internal agent operations is the same thing: **a typed, validated, machine-actionable commerce data model** — which is literally what json-render catalog + documents domain + XState machines already are.

---

## Part 2: Best Current AI Usage in Ecommerce (State of the Art)

| Capability | Who does it best today | Technique | Our equivalent slot |
|-----------|----------------------|-----------|---------------------|
| Product discovery | Amazon Alexa for Shopping (ex-Rufus), Perplexity | Semantic retrieval over catalog + session context | Context engine + analytics events as retrieval features |
| Merchant copilot | Shopify Sidekick | Chat over store admin data; drafts policies/listings | Agent panel (already built in editor) |
| Content generation | Shopify Magic | Product descriptions, SEO meta from images/title | AI pipeline domain (60% built) |
| Layout/experience optimization | Nobody mainstream | — | **Our core bet**: generate + bandit-select full layouts |
| Dynamic pricing | Amazon seller agents | Rule + RL hybrid on margin/inventory signals | Phase 3 (denied-guardrail by default) |
| Support/shopping concierge | Intercom Fin, Alexa for Shopping | RAG over catalog/policies | Nango-connected agent tools |
| Creative testing | Meta Advantage+ | Generative variants + budget bandit | Same math, applied to layout JSON instead of ad creative |

**Key insight from research**: conversion lifts attributed to AI personalization/recommendation stack range ~10–25% (site-specific), but *every* measured winner shares one property: **closed feedback loop between exposure decision and outcome measurement.** Our schemaId+variantId+contextHash attribution is precisely that loop, at finer granularity than anyone.

---

## Part 3: Future Plan — "Agent Commerce" Roadmap

### Phase A (Now → Phase 0 complete): Human-visible commerce
As documented in `COMMERCE_ENGINE_GAP_ANALYSIS.md`: server commerce domain, components, Stripe Connect, demo store. **No agent work until a human can buy.**

### Phase B (Phase 1): Store becomes agent-legible
| Deliverable | Description |
|-------------|-------------|
| **Product feed endpoint** | Structured product JSON (schema.org/Product superset) at a stable URL — shaped to also satisfy Shopify Catalog / UCP discovery expectations |
| **`/.well-known/ucp` manifest + `llms.txt`** | UCP capability discovery document (checkout/discount/fulfillment capabilities, payment handlers) plus machine-readable store capabilities, policies, shipping, returns |
| **UCP read-side** | Products + availability exposed so external assistants (Gemini, Copilot, ChatGPT discovery) can browse accurately |
| **Checkout delegation stub** | UCP checkout-session-compatible shape reserved — maps naturally onto our XState cart JSONB — keeping Stripe Shared Payment Token compatibility for ACP rails |

### Phase C (Phase 2): Agents as staff
| Agent Role | Tasks (human assigns, reviews, approves — existing Mastra guardrails) |
|-----------|---------------------------------------------------------------------|
| **Merchandiser** | Reorder collections, write collection copy, schedule seasonal layouts |
| **CRO Analyst** | Watch funnels → file insights → propose layout variants (the [Fix This] loop) |
| **Content Writer** | PDP descriptions, FAQ, blog, alt-text from images |
| **Support Concierge** | Answer order-status/product questions via Nango tools; escalate to human |
| **Inventory Watcher** | Low-stock alerts → urgency badge props → restock notifications |

### Phase D (Phase 3): Two-way agentic commerce
| Deliverable | Description |
|-------------|-------------|
| **Protocol sell-side (UCP first)** | Merchant opts in; orders can originate inside agent surfaces — Gemini/Google AI Mode and Shopify-ecosystem agents via UCP; Copilot Checkout via ACP. We handle session/webhook completion identically to Stripe webhooks |
| **Checkout sessions as protocol objects** | Cart state machine already externalizable (XState JSONB) — expose create/update/complete as UCP checkout sessions rather than bespoke cart ops |
| **AP2 mandate verification** | Accept agent-initiated orders carrying intent/payment mandates (FIDO-governed AP2 v0.2); verify signatures before fulfillment |
| **Buyer-side agent (opt-in)** | "Reorder my usual," price-watch, bundle negotiation — platform ships reference buyer agent |

### Phase E (Phase 4): Self-improving stores
- Bandit infrastructure generalizes: any KPI (AOV, LTV, return rate) selectable as optimization target
- Cross-store transfer learning (feature store aggregates layout→conversion mappings)
- Guardrail DSL matured: merchants express invariants ("never hide free-shipping badge", "price never changes") enforced at validation layer before ANY publish, human or agent

---

## Part 4: Model Strategy (Best AI Usage For This Platform)

### Task → Model Matrix

| Task class | Latency need | Recommended model class | Notes |
|-----------|-------------|------------------------|-------|
| Layout JSON generation | seconds, cached after | Frontier LLM (Claude/GPT-class) | Highest-value call; validate hard; cache by segment hash |
| Product copy | batch | Mid-tier LLM or fine-tuned small | Volume work; brand-voice few-shot |
| Insight summarization | near-real-time | Small fast model | Reads ClickHouse aggregates, writes plain language |
| Bandit routing | <50ms | **Not an LLM** — Thompson sampling in edge Worker | Deterministic ML, no token cost |
| Segment classification | per-request | Rules + tiny model at edge | Heuristics first; escalate only on cache miss |
| Embedding/search | per-index | Off-the-shelf embeddings | Catalog vectors refreshed on publish |

### Cost Discipline (from FINDINGS.md pricing tiers)
- Analytics queries, bandit execution, ML feedback = **free** (no LLM)
- Generation/content = metered "actions"
- 90%+ edge-cache hit target keeps frontier-model spend bounded
- Per-org BYO-key (LLM credentials per org already scaffolded in tenant settings)

### Safety Rails (non-negotiable)
1. **Human approval default** — nothing publishes without review (already the product principle)
2. **Denied guardrails**: pricing, refunds, PII, order mutation — never agent-writable
3. **Schema validation gate**: invalid JSON never renders, regardless of source
4. **Mandate verification** (Phase D): agent-originated orders require cryptographic authorization proof
5. **Audit trail**: document_ops log already captures actorType/onBehalfOf/taskId — extend to agent provenance

---

## Part 5: What We Explicitly Do NOT Build

| Tempting but wrong | Why not |
|--------------------|---------|
| Our own foundation model | Rent intelligence; differentiate on data loop + distribution |
| Autonomous pricing bot (default-on) | Liability nightmare; keep in denied guardrails |
| Proprietary agent protocol competing with ACP/UCP/AP2 | Adopt standards; be the easiest store to plug INTO them |
| Per-request LLM rendering for everyone | Cache-by-segment is the only economically viable path |
| In-house vector DB | pgvector/embeddings API sufficient at this scale |

---

## Sources (Primary Research)

Protocol state:
- [UCP — specification hub](https://ucp.dev/)
- [Google Developers — Under the Hood: Universal Commerce Protocol](https://developers.googleblog.com/under-the-hood-universal-commerce-protocol-ucp/)
- [Shopify Engineering — Building the Universal Commerce Protocol](https://shopify.engineering/ucp)
- [Shopify — Spring '26 Edition: agentic commerce for every developer](https://www.shopify.com/news/spring-26-edition-dev)
- [Stripe — Developing an open standard for agentic commerce](https://stripe.com/blog/developing-an-open-standard-for-agentic-commerce) (launch, Sep 2025 — historical)
- [OpenAI — Buy it in ChatGPT](https://openai.com/index/buy-it-in-chatgpt/) (launch, Sep 2025 — Instant Checkout discontinued Mar 2026)
- [TWWIM — OpenAI shuts down Instant Checkout: 12 Shopify merchants went live](https://www.twwim.ai/blog/openai-shuts-down-instant-checkout-12-shopify-merchants)
- [Evolve Media — ChatGPT Shopping in 2026: Why Instant Checkout Failed and What Replaced It](https://evolveamz.com/chatgpt-shopping-instant-checkout-guide)
- [Google Cloud — Announcing Agent Payments Protocol (AP2)](https://cloud.google.com/blog/products/ai-machine-learning/announcing-agents-to-payments-ap2-protocol)
- [FIDO Alliance — Standards for trusted AI-agent interactions (AP2 donation)](https://fidoalliance.org/fido-alliance-to-develop-standards-for-trusted-ai-agent-interactions/)

Platform moves:
- [Microsoft — Conversations that Convert: Copilot Checkout and Brand Agents](https://about.ads.microsoft.com/en/blog/post/january-2026/conversations-that-convert-copilot-checkout-and-brand-agents)
- [SellerForge — Amazon Alexa for Shopping Replaces Rufus (May 2026)](https://www.sellerforge.ai/blog/amazon-alexa-for-shopping-replaces-rufus)
- [SellerMetrics — Amazon Merges Rufus and Alexa: Prepare for Agentic AI Search](https://sellermetrics.app/amazon-merges-rufus-and-alexa)
- [Digital Commerce 360 — commercetools introduces standalone agentic commerce product (AgenticLift)](https://www.digitalcommerce360.com/2026/01/21/commercetools-introduces-standalone-agentic-commerce-product/)
- [Google Blog — Shop with AI Mode, agentic buying & virtual try-on](https://blog.google/products-and-platforms/products/shopping/google-shopping-ai-mode-virtual-try-on-update/)
- [9to5Google — Google agentic 'Buy for me' rollout](https://9to5google.com/2025/11/13/google-agentic-shopping/)
- [Mirakl — Making product pages visible to AI agents (AEO/GEO)](https://www.mirakl.com/blogs/brands-sellers/how-to-make-your-product-pages-visible-for-ai-agents/)
