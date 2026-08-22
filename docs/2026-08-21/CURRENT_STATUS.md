# Current Implementation Status
## As of 2026-08-21

---

## Executive Summary

**Phase 0 (Foundation) is ~65% complete.** The platform has exceptional infrastructure (auth, collab, flags, machines, webhooks, analytics, tenant catalog) but **the commerce vertical — the core value proposition — is only 10% built.**

The team pivoted from GrapesJS to a **custom inline visual editor** (Shopify Theme Editor style) which is **substantially implemented** in `packages/client/src/editor/`. Roadmap docs still reference GrapesJS incorrectly.

---

## What Is Built (Production-Ready)

### Platform Infrastructure (Ahead of Roadmap)

| Domain | Status | Location |
|--------|--------|----------|
| **Auth (Zitadel/Logto)** | ✅ Complete | `packages/server/src/domains/auth/` |
| **Documents/CMS** | ✅ Complete | `packages/server/src/domains/documents/` |
| **Real-time Collaboration** | ✅ Advanced | `packages/client/src/editor/collab/`, `packages/server/src/domains/collab/` |
| **Feature Flags** | ✅ Complete | `packages/server/src/domains/flags/` |
| **State Machines (XState)** | ✅ Complete | `packages/server/src/domains/machines/` |
| **Secrets (Vault + env)** | ✅ Complete | `packages/server/src/domains/secrets/` |
| **Webhooks (inbound/outbound)** | ✅ Complete | `packages/server/src/domains/webhooks/` |
| **Nango Integrations** | ✅ Complete | `packages/server/src/domains/integrations/` |
| **Analytics (ClickHouse)** | ✅ Complete | `packages/server/src/domains/analytics/` |
| **Notifications (email/SMS/webhooks)** | ✅ Complete | `packages/server/src/domains/notifications/` |
| **Tenant Catalog (Module Federation)** | ✅ Complete | `packages/server/src/domains/tenant/` |
| **AI Agent Framework** | 🟡 80% | `packages/server/src/domains/agent/` + `mastra/` |
| **AI Generation Pipeline** | 🟡 60% | `packages/server/src/domains/ai-pipeline/` |
| **Context Engine** | 🟡 70% | `packages/server/src/domains/context/` |
| **Edge Delivery (Workers)** | 🟡 70% | `packages/workers/src/` |

### Visual Editor (Custom, NOT GrapesJS)

**Location:** `packages/client/src/editor/`

| Feature | Status |
|---------|--------|
| **VisualEditorShell** — main layout with chrome, palette, layers, canvas, props, agent panel | ✅ Complete |
| **EditorCanvas** — drag-drop, selection, reorder, drop indicators, collab cursors | ✅ Complete |
| **ComponentPalette** — pinned shortcuts + searchable catalog from live registry | ✅ Complete |
| **LayerTreePanel** — hierarchical spec view, reorder, duplicate, delete | ✅ Complete |
| **PropsPanel** — dynamic form fields from catalog edit metadata | ✅ Complete |
| **SaveBar** — save draft / publish / discard with conflict handling | ✅ Complete |
| **Agent Panel Integration** — chat-based AI agent task assignment, review, approve/reject/undo | ✅ Complete |
| **Real-time Collab** — Yjs + Automerge, remote cursors, presence, agent-as-collaborator | ✅ Complete |
| **Edit Metadata System** — auto-generated from Zod schemas + overrides | ✅ Complete |

**This IS the visual CMS.** It supersedes GrapesJS for the initial release. The merchant edits the live rendered page by clicking components (`?edit=true`), same URL, same components, same catalog.

### Commerce Extension (Skeleton Only)

**Location:** `packages/extensions/src/commerce/`

| Component | Status |
|-----------|--------|
| `Hero` | ✅ Complete |
| `ProductCard` | ✅ Complete |
| `addToCart` / `checkout` actions | ✅ Client-side only |
| `cart` XState machine | ✅ Definition only |
| `ProductGrid`, `ProductInfo`, `AddToCart`, `CartDrawer`, `CheckoutButton`, `CartSummary` | ❌ Missing |
| Server commerce domain (products, inventory, orders, payments) | ❌ Missing |
| Stripe Connect integration | ❌ Missing |
| Shopify adapter | ❌ Missing |

---

## What Is NOT Built (Critical Gaps)

### 1. Commerce Server Domain — **0% Complete**
No `packages/server/src/domains/commerce/` exists. Required:
- Product content type + inventory
- Server-persisted cart (replace client sessionStorage)
- Checkout: Stripe Checkout Session creation, webhook fulfillment
- Orders: creation, status transitions, fulfillment
- Shopify adapter (Storefront API for products/cart/checkout)
- Multi-currency, tax, shipping

### 2. Complete Commerce Catalog Components — **~20% Complete**
Only `Hero` + `ProductCard` exist. Need ~10 more components with full edit metadata.

### 3. Cart/Checkout Flow End-to-End
- Client `cart.ts` uses XState machine via `/api/machines/*` but no server routes persist cart across sessions
- No authenticated user cart sync
- `checkout` action just does `window.location.href = "/checkout"` — no Stripe session creation

### 4. Storefront Rendering (Workers → Client)
- Workers serve `index.html` from R2 for non-bot traffic
- Bot SSR exists (`bot-ssr.ts`) but only extracts SEO meta
- No client hydration path for interactive storefront
- No SpecStream JSON diff for navigation

### 5. Demo Store (Phase 0.8)
Cannot exist without commerce engine.

---

## Corrected Phase 0 Status

| # | Deliverable | Roadmap Target | **Actual** | Gap |
|---|-------------|---------------|------------|-----|
| 0.1 | Server Scaffold | Weeks 1-2 | ✅ 100% | — |
| 0.2 | json-render Integration | Weeks 1-2 | 🟡 70% | Need 8 more commerce components |
| 0.3 | CMS Engine | Weeks 2-4 | 🟡 85% | Inline editor built (not GrapesJS) |
| 0.4 | AI Generation Pipeline v0.1 | Weeks 2-4 | 🟡 60% | Needs storefront prompts + catalog validation |
| 0.5 | **Commerce Engine** | Weeks 3-5 | ❌ **10%** | **Largest gap — no server domain** |
| 0.6 | Context Engine v0.1 | Weeks 4-6 | 🟡 70% | Client signal collection missing |
| 0.7 | AI Agent Manager v0.1 | Weeks 5-6 | 🟡 80% | Needs "optimize page" concrete task |
| 0.8 | Demo Store | Weeks 5-6 | ❌ 0% | Blocked on 0.5 |

---

## Priority Order to Complete Phase 0

### Week 1-2: Commerce Server Domain (Unblocks Everything)
```bash
packages/server/src/domains/commerce/
├── index.ts                    # Domain entry
├── products/
│   ├── schema.ts               # Product content type + variants
│   ├── service.ts              # CRUD, search, inventory
│   └── routes.ts
├── cart/
│   ├── machine.ts              # Enhanced XState cart machine
│   ├── service.ts              # Server cart persistence
│   └── routes.ts               # GET/POST /api/cart
├── checkout/
│   ├── service.ts              # Stripe Checkout Session creation
│   ├── webhook.ts              # Stripe webhook handler
│   └── routes.ts
├── orders/
│   ├── schema.ts
│   ├── service.ts
│   └── routes.ts
├── shopify/
│   ├── adapter.ts              # Storefront API implementation
│   └── routes.ts
└── index.ts                    # CommerceDomainDeps, createCommerceDomain
```

### Week 2-3: Complete Commerce Catalog
Add to `packages/extensions/src/commerce/`:
- `ProductGrid`, `ProductInfo`, `AddToCart` (sticky/inline variants)
- `CartDrawer`, `CartSummary`, `CheckoutButton`
- `CollectionPage`, `SearchResults`, `Pagination`
- Full edit metadata for each (auto-generated from Zod + overrides)

### Week 3: Wire Client ↔ Server Cart
- Replace `sessionStorage` cart with server API calls
- Authenticated user cart persistence
- Guest cart → user cart merge on login

### Week 4: Checkout Flow + Demo Store
- Stripe Checkout Session creation from server
- Webhook → order creation → inventory decrement
- AI generates storefront → merchant approves → visitor buys

---

## Doc Corrections Needed

| File | Correction |
|------|------------|
| `ROADMAP.md` | Replace "GrapesJS visual editor integration" with "Custom inline visual editor (complete)" |
| `TECH.md` | Update Visual CMS section to describe inline editor architecture |
| `STACK.md` | Remove GrapesJS row; add inline editor as built component |
| `OVERVIEW.md` | Update CMS description to reflect click-to-edit inline editor |
| `PRODUCT.md` | Update Feature Set: CMS = "Inline visual editor (click-to-edit on live storefront)" |

---

## Conclusion

**The platform infrastructure is remarkable — ahead of roadmap in many areas.** The inline visual editor is a **differentiator** (lighter, higher fidelity than GrapesJS). But **without the commerce engine, there is no product to sell.**

**Recommendation:** Freeze all non-commerce work. 100% focus on `packages/server/src/domains/commerce/` + commerce catalog completion. Phase 0 completes when a real visitor can add to cart and checkout on an AI-generated storefront.