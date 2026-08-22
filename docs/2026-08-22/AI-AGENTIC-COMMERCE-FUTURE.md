# AI & Agentic Commerce — Future Plans
## Where the Industry Is Going and How This Platform Wins It
### As of 2026-08-22 (Research-Based)

---

## Part 1: What Changed in the Industry (2025 Research)

The commerce industry crossed a threshold: **AI is no longer a feature inside stores — AI is becoming a shopping channel that sits outside stores.** Three protocol-level standards plus platform moves define the new battlefield:

### 1.1 The Agentic Commerce Protocols

| Protocol | Backers | What it does | Status |
|----------|---------|--------------|--------|
| **ACP (Agentic Commerce Protocol)** | OpenAI + Stripe | "Buy it in ChatGPT" — merchants expose products + delegated checkout inside ChatGPT conversations. Merchant of record stays the seller; Stripe handles payment tokenization via Shared Payment Tokens. | Live with Etsy/Shopify sellers |
| **UCP (Universal Commerce Protocol)** | Google | Open standard for "agent-ready websites" — products, carts, checkout, warranties as discoverable agent-negotiable entities across any assistant (Gemini, third-party agents). | Announced; spec public |
| **AP2 (Agent Payments Protocol)** | Google + Coinbase + Mastercard + 60+ | Cryptographic "mandates" proving a human authorized an agent's purchase (intent cart mandates, cart payment mandates) — solves non-repudiation for agent-initiated payments. | Spec phase, broad coalition |

**Why this matters to us**: Every one of these protocols needs exactly what our architecture already produces — **structured, machine-readable product data and machine-composable commerce actions.** A JSON-native store is trivially agent-addressable. A Liquid/PHP store is not.

### 1.2 Platform Moves

| Platform | Move | Signal |
|----------|------|--------|
| **Shopify** | Catalog syndication to ChatGPT/Perplexity/Copilot; **Universal Cart** (cross-merchant cart carried by the assistant); Checkout Kit | Shopify is repositioning from storefront host → **commerce rails for AI surfaces** |
| **Amazon** | Rufus (shopping assistant) backed by Cosmo (semantic intent model); agentic seller ops (pricing, inventory, listings) | Discovery is shifting from keyword search → **intent conversation** |
| **Google** | AI Mode shopping, agentic **"Buy for me"**, virtual try-on | Checkout itself becomes delegable |
| **Perplexity / Copilot** | In-assistant product cards + buy | New traffic sources with zero storefront visits |

### 1.3 The Strategic Consequence for Us

Two futures exist for every merchant:

```
FUTURE A (passive):  Merchant's store gets scraped/syndicated by assistants.
                     Margins compress; brand becomes a SKU row in ChatGPT.

FUTURE B (active):   Merchant runs an AI-NATIVE store that:
                     - Is fully legible to external agents (ACP/UCP endpoints)
                     - Fights back with per-visitor generation when humans DO visit
                     - Deploys its OWN agents as staff (ops, content, optimization)
```

Our platform is uniquely positioned for Future B because the hard part of both ACP/UCP compliance AND internal agent operations is the same thing: **a typed, validated, machine-actionable commerce data model** — which is literally what json-render catalog + documents domain + XState machines already are.

---

## Part 2: Best Current AI Usage in Ecommerce (State of the Art)

| Capability | Who does it best today | Technique | Our equivalent slot |
|-----------|----------------------|-----------|---------------------|
| Product discovery | Amazon Rufus, Perplexity | Semantic retrieval over catalog + session context | Context engine + analytics events as retrieval features |
| Merchant copilot | Shopify Sidekick | Chat over store admin data; drafts policies/listings | Agent panel (already built in editor) |
| Content generation | Shopify Magic | Product descriptions, SEO meta from images/title | AI pipeline domain (60% built) |
| Layout/experience optimization | Nobody mainstream | — | **Our core bet**: generate + bandit-select full layouts |
| Dynamic pricing | Amazon seller agents | Rule + RL hybrid on margin/inventory signals | Phase 3 (denied-guardrail by default) |
| Support/shopping concierge | Intercom Fin, Rufus | RAG over catalog/policies | Nango-connected agent tools |
| Creative testing | Meta Advantage+ | Generative variants + budget bandit | Same math, applied to layout JSON instead of ad creative |

**Key insight from research**: conversion lifts attributed to AI personalization/recommendation stack range ~10–25% (site-specific), but *every* measured winner shares one property: **closed feedback loop between exposure decision and outcome measurement.** Our schemaId+variantId+contextHash attribution is precisely that loop, at finer granularity than anyone.

---

## Part 3: Future Plan — "Agent Commerce" Roadmap

### Phase A (Now → Phase 0 complete): Human-visible commerce
As documented in `COMMERCE_ENGINE_GAP_ANALYSIS.md`: server commerce domain, components, Stripe Connect, demo store. **No agent work until a human can buy.**

### Phase B (Phase 1): Store becomes agent-legible
| Deliverable | Description |
|-------------|-------------|
| **Product feed endpoint** | Structured product JSON (schema.org/Product superset) at a stable URL — prerequisite for every aggregator and protocol |
| **`llms.txt` + agent manifest** | Machine-readable description of store capabilities, policies, shipping, returns |
| **ACP/UCP read-side** | Products + availability exposed so external assistants can browse accurately |
| **Checkout delegation stub** | Delegated-checkout endpoint pattern reserved (Stripe Shared Payment Token compatible shape) |

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
| **ACP sell-side** | Merchant opts in; orders can originate inside ChatGPT; we handle webhook → order creation identically to Stripe webhooks |
| **Universal Cart participation** | Cart state machine already externalizable (XState JSONB) — expose cart ops as protocol endpoints |
| **AP2 mandate verification** | Accept agent-initiated orders carrying intent/payment mandates; verify before fulfillment |
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

- [Stripe — Developing an open standard for agentic commerce](https://stripe.com/blog/developing-an-open-standard-for-agentic-commerce)
- [OpenAI — Buy it in ChatGPT & Agentic Commerce Protocol](https://openai.com/index/buy-it-in-chatgpt/)
- [Google Developers — Under the Hood: Universal Commerce Protocol](https://developers.googleblog.com/under-the-hood-universal-commerce-protocol-ucp/)
- [Google Cloud — Announcing Agent Payments Protocol (AP2)](https://cloud.google.com/blog/products/ai-machine-learning/announcing-agents-to-payments-ap2-protocol)
- [PYMNTS — Shopify Brings Merchant Catalogs to ChatGPT, Perplexity and Copilot](https://www.pymnts.com/news/artificial-intelligence/2025/shopify-brings-merchant-catalogs-to-chatgpt-perplexity-and-copilot/)
- [PYMNTS — Shopify's Universal Cart Makes AI the New Storefront](https://www.pymnts.com/news/ecommerce/2025/shopify-universal-cart-ai-new-storefront/)
- [Google Blog — Shop with AI Mode, agentic buying & virtual try-on](https://blog.google/products-and-platforms/products/shopping/google-shopping-ai-mode-virtual-try-on-update/)
- [9to5Google — Google agentic 'Buy for me' rollout](https://9to5google.com/2025/11/13/google-agentic-shopping/)
- [Zinc — What Is ACP? The Agentic Commerce Protocol Explained](https://www.zinc.com/blog/what-is-acp)
- [Search Engine Journal — What Google's UCP Tells Us About Agent-Ready Websites](https://www.searchenginejournal.com/what-googles-ucp-tells-us-about-agent-ready-websites/574220/)
- [ZoNurus/BBE — How Amazon Rufus decides recommendations (Cosmo)](https://www.zonguru.com/blog/how-amazon-rufus-recommends-products)
- [PPC Land — Amazon introduces agentic AI across seller platform](https://ppc.land/amazon-introduces-agentic-ai-across-seller-platform/)
- [Zipify — Shopify Sidekick capabilities overview](https://zipify.com/blog-shopify-copilot/)
- [Mirakl — Making product pages visible to AI agents (AEO/GEO)](https://www.mirakl.com/blogs/brands-sellers/how-to-make-your-product-pages-visible-for-ai-agents/)
