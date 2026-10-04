# Noname Authoritative Roadmap — Current Code Truth

Initial reconciliation: 2026-09-14
Latest targeted update: 2026-10-03 (Audience/Experience status)
Status: Current planning reference built on the 2026-09-14 code audit; dated updates link later evidence where available. Claims without a later update retain their source-date context.

## Why this document exists

Several earlier roadmap/status documents are now stale because implementation continued after they were written. In particular:

- `docs/2026-08-21/CURRENT_STATUS.md` predates the Commerce checkout hardening, Evidence Kernel, Orders admin, seeding package, and fixture package.
- `docs/2026-09-09/COMMERCE-HARDENING-IMPLEMENTATION.md` still says checkout workstreams are pending even though the final live verification record exists.
- `docs/2026-09-10/CHECKOUT-RELIABILITY-PLAN.md` contains the original plan and historical baseline; its implementation status is superseded by the 2026-09-12 verification record.
- `docs/2026-09-12/EDGE-SEO-PRERENDER-IMPLEMENTATION.md` says personalization is next, but `EDGE-PERSONALIZATION-IMPLEMENTATION.md` records that work as complete.
- The older roadmap assumes a `packages/server/src/domains/commerce` domain. Current architecture deliberately keeps Commerce behavior in `packages/verticals` and Commerce UI/actions in the Commerce extension.

This document is the current planning source. Earlier documents remain historical evidence and design rationale, not current status.

**Implementation update (2026-10-03):** The user-approved Audience/Experience and context-contract replacement is implemented for local source scope. The populated no-provider member/default Browser MCP journey and decimal-day attribution persistence are verified; see [`../2026-09-26/PERSONALIZATION-IMPLEMENTATION-PLAN.md`](../2026-09-26/PERSONALIZATION-IMPLEMENTATION-PLAN.md) and [`../2026-10-03/E2E-AUDIENCE-PAGE-FLOW.md`](../2026-10-03/E2E-AUDIENCE-PAGE-FLOW.md). Production tenant-rule/consumer inventory, production retention decisions, post-exposure aggregate-outcome UI verification, and provider-backed checkout remain follow-up. The 2026-09-27 notes below are historical where superseded by these records.

**Commerce storefront update (2026-10-04):** The second storefront slice adds `CartDrawer`, `CheckoutButton`, `CollectionPage`, `SearchResults`, and `Pagination`, enhances `CartSummary`, and introduces a generic, publishable-key-protected `/api/storefront/content/:type` read path. It returns only published records and explicitly public fields, tenant-scopes collection slugs, resolves enabled locales, and filters/searches before stable pagination. The extension has 11 Commerce catalog components total; see the complete inventory below. The new collection and search layouts exercise the published-content action and `$state` results. Focused endpoint/component tests, package typechecks, the client production build, and live seed/browser verification pass. Product, collection, search, cart quantity/removal, admin, and editor flows were exercised; payment-provider checkout/callback was not.

## Current implementation baseline

### Platform infrastructure

| Capability | Current evidence | Status |
|---|---|---|
| Authentication and tenant identity | `packages/server/src/domains/auth`, ZITADEL integration, tenant resolution | Implemented for current scope |
| Documents/CMS | `packages/server/src/domains/documents` | Implemented for current scope |
| Admin shell and catalog loading | `packages/client/src/admin`, platform routes/registry | Implemented |
| Visual editor | `packages/client/src/editor` | Implemented and live-smoke verified |
| Collaboration | client Automerge/Yjs and server collab domain | Implemented for current scope |
| Feature flags | server flags domain and client integration | Implemented for current scope |
| Machines | generic machine routes, normalized JSON, XState actors, persistence | Implemented for flat-state current contract |
| Webhooks/integrations | generic webhook, Nango, provider receipt and worker paths | Implemented and live verified for current checkout path |
| Notifications | email/SMS/webhook notification domain | Implemented for current scope |
| Analytics | ClickHouse analytics domain and browser ingest | Implemented for current scope |
| Evidence/provenance | immutable records, activities, links, audit, generic read API | Implemented |
| Seeding | `packages/seeding` CLI, platform/Commerce/full profiles | Implemented |
| Shared fixtures | `packages/fixtures` pure cross-package data | Initial package implemented |

### Commerce

Commerce is intentionally split by ownership:

```text
packages/verticals/src/commerce
  business capabilities, checkout mapping, order projection, provider-neutral semantics

packages/extensions/src/commerce
  components, actions, catalog schemas, cart UI, Orders admin UI

packages/server/src/domains
  generic machines, capabilities, integrations, evidence, documents, auth, persistence ports
```

There should not be a Commerce-specific branch added to generic server domains merely because an older status document proposed `packages/server/src/domains/commerce`.

Current Commerce capabilities include:

- Commerce extension registration and lifecycle
- Product content/catalog lookup for trusted checkout pricing
- Guest cart and authenticated cart flow
- Guest claim/ownership stamping
- Checkout capability through the generic capability route
- Provider-neutral checkout adapters
- Nango credential isolation and provider proxying
- `checkout_started`, `awaiting_payment`, `paid`, and failure mappings
- Durable capability idempotency
- Durable provider-event receipts and duplicate suppression
- BullMQ provider-event processing
- Payment-success order projection
- Immutable order/payment Evidence records
- `paid_by` and `caused_by` Evidence links
- Commerce-owned read-only Orders admin UI
- Responsive `ProductGrid` and CMS-bound `ProductInfo` storefront components
- Live Stripe Sandbox checkout and signed callback-to-paid verification (local Nango-boundary callback; see the dated verification record for the external-webhook caveat)

## Completed roadmap milestones

### Checkout reliability — complete

Evidence:

```text
docs/2026-09-12/CHECKOUT-RELIABILITY-LIVE-VERIFICATION.md
docs/2026-09-12/CHECKOUT-RELIABILITY-IMPLEMENTATION-DETAILS.md
```

Verified:

- XState normalization and ephemeral actor execution
- Server-authoritative checkout pricing
- Capability idempotency with replay/conflict/retry behavior
- Live Postgres concurrency for idempotency
- Durable provider-event receipt deduplication
- Nango → BullMQ → worker → machine path
- Stripe Sandbox checkout
- Signed callback-to-`paid`
- Duplicate callback suppression
- Persisted machine reload
- Guest and authenticated cart behavior

The only intentionally deferred external check is a real public Stripe webhook delivery. The normal application callback path was exercised through a signed local Nango-boundary event.

### Edge SEO and personalization — complete for current local scope

Evidence:

```text
docs/2026-09-12/EDGE-SEO-PRERENDER-IMPLEMENTATION.md
docs/2026-09-12/EDGE-PERSONALIZATION-IMPLEMENTATION.md
```

Verified:

- React 19 streaming bot HTML
- SEO content extraction
- Tenant resolution
- Personalization signal forwarding
- Personalized bot path fallback behavior
- Desktop/mobile/tablet local scenarios
- Browser console clean in the tested flows

Production deployment through Wrangler/Cloudflare remains an operational release task, not an unimplemented application feature.

**Personalization scope clarification (updated 2026-10-03):** The retired request-signal Context path has been replaced locally by trusted activities, verified-account audience membership, page/locale-bound experience decisions, explicit flag evaluation subjects, and named analytics dimensions. The document field `segment` remains only a layout-variant selector mapped to an experience `variantId`; it is not customer targeting. A populated local Audience/binding fixture now exists. The no-provider E2E verified the signed-in account's default before a trusted service activity, member experience after assignment, and signed-out default afterward. It did not exercise a provider checkout/callback or verify a post-exposure goal updating the aggregate performance report; production rule/consumer inventory and retention decisions also remain open. See [`../2026-09-26/PERSONALIZATION-IMPLEMENTATION-PLAN.md`](../2026-09-26/PERSONALIZATION-IMPLEMENTATION-PLAN.md) and [`../2026-10-03/E2E-AUDIENCE-PAGE-FLOW.md`](../2026-10-03/E2E-AUDIENCE-PAGE-FLOW.md).

### Evidence and Orders — initial slice complete

Evidence:

```text
docs/2026-09-12/EVIDENCE-PROVENANCE-IMPLEMENTATION.md
docs/2026-09-12/ORDERS-ADMIN-IMPLEMENTATION.md
```

Implemented:

- Generic Evidence routes
- Commerce order projection
- Immutable paid order/payment records
- Typed Evidence links
- Commerce-owned Orders admin read view
- Generic Evidence API consumption
- Commerce permission and route registration
- Deterministic demo order fixture

This is a read projection, not a full order-management aggregate.

### Seed and fixture architecture — complete initial boundary

Evidence:

```text
docs/2026-09-14/SEEDING-ARCHITECTURE-IMPLEMENTATION.md
docs/2026-09-14/TEST-FIXTURE-ARCHITECTURE-ANALYSIS.md
```

Implemented:

- `packages/seeding` runner and CLI
- Platform, Commerce, and full profiles
- No obsolete `scripts/seed` tree
- `packages/fixtures` neutral shared fixture package
- Tests no longer import seed profiles

## Genuine remaining roadmap

### P0 — release evidence and operational closure

These are not new architecture features. They are the remaining proof/release tasks around code that already exists.

#### 1. Final live checkout-to-Orders verification

Run one complete live path and record:

```text
Stripe Sandbox checkout
→ signed/provider callback path
→ machine paid
→ Commerce order projection
→ Evidence records and links
→ /admin/orders row and detail
```

**Verified 2026-10-03:** a Stripe Sandbox payment, locally Nango-HMAC-signed provider-envelope callback, persisted `paid` cart, correlated Evidence order, and `/admin/orders` row were observed in the same run. The callback was a local Nango-boundary simulation, not an actual Stripe→Nango webhook; track that external-delivery gap under item 2.

#### 2. Real external webhook verification

Optional before local release, required before production claim:

```text
Stripe CLI or public tunnel
→ real Stripe webhook
→ Nango ingress
→ receipt claim
→ BullMQ
→ normalized event
→ XState
```

The application path is already verified with a correctly signed local Nango-boundary callback.

#### 3. Deployment verification

- Wrangler/Cloudflare deployment for workers
- Production environment secrets and bindings
- Public host/custom-domain routing
- Production webhook URL
- R2 asset deployment
- Rollback and health checks

### P1 — Commerce product completeness

These are the actual product features still absent or intentionally deferred.

#### 4. Commerce catalog expansion

The following is the complete Commerce extension catalog inventory in this checkout (not the full platform catalog):

| Catalog component | Status | Notes |
|---|---|---|
| `Hero` | Implemented | Storefront banner |
| `ProductCard` | Implemented | Product summary and add-to-cart |
| `ProductGrid` | Implemented | Responsive composition slot for product cards |
| `ProductInfo` | Implemented | CMS-bound detail, price, quantity, and add-to-cart |
| `CartSummary` | Implemented; enhanced 2026-10-03 | Inline totals, quantity adjustment/removal, checkout and payment state |
| `CartDrawer` | Implemented 2026-10-03 | Accessible side panel with item controls and subtotal |
| `CheckoutButton` | Implemented 2026-10-03 | Primary, outline, and link variants |
| `CollectionPage` | Implemented 2026-10-03 | Renders published CMS products from renderer state |
| `SearchResults` | Implemented 2026-10-03 | Searches public published content through catalog action |
| `Pagination` | Implemented 2026-10-03 | Offset-based previous/next controls |
| `OrdersAdmin` | Implemented | Read-only order/evidence view |

**Count:** 11 Commerce catalog components total; 2 were created in the first storefront slice and 5 in the second slice.

The generic published-content read path is `GET /api/storefront/content/:type`. It is tenant-scoped by the edge-signed organization, requires that tenant's publishable key, returns only published entries, and projects only schema fields explicitly marked with `permissions.read: ["public"]`. Search is restricted to those fields and the selected/default enabled locale; collection slugs resolve within the tenant. The response uses a narrow `{ id, data }` shape with bounded limit/offset and a `nextOffset` cursor hint—never a raw `DocumentDTO`. The generic raw document list/search/record-resolution routes remain staff-only, so possession of a publishable key cannot bypass the storefront projection. Listing actions place results in renderer `$state`; product records are not embedded as static layout props.

All component additions remain Commerce extension-owned, use flat catalog props, and include visual-editor metadata. The demo seeds `/collections/all` and `/search` layouts to exercise dynamic content loading. Follow-up work: expose public-field permissions cleanly in content-type editing, add total-count/cursor pagination if catalog scale requires it, and verify these layouts against a running stack.

#### 5. Order operations

The current Orders admin is read-only. Deferred operations are:

- Cancellation
- Refund actions
- Fulfillment state
- Inventory reservation/decrement
- Customer order history
- Search by customer/email
- Cursor pagination
- Order detail aggregate
- Payment/refund reconciliation

These should be added as Commerce vertical capabilities and Commerce extension actions, not generic Evidence mutations.

#### 6. Commerce persistence depth

The current checkout path proves cart workflow and payment projection, but product expansion may require explicit vertical-owned ports for:

- Product/variant catalog
- Inventory reservation
- Durable order aggregate
- Fulfillment
- Refunds
- Customer identity/order history

The design should extend `packages/verticals/src/commerce` and narrow server ports as needed. Do not create a generic server Commerce domain unless a concrete boundary requires it.

### P2 — platform and production hardening

Only after the P0/P1 product path is stable:

- Public Stripe webhook/tunnel production setup
- Wrangler deployment automation
- Custom domains and SSL
- Production edge cache invalidation
- Worker/R2 deployment rollback
- Rate limits and coverage thresholds
- Advanced Evidence pagination/search
- Browser/client performance and bundle budgets
- Production observability dashboards and alerts

### P3 — future product expansion

Not current blockers:

- Shopify integration mode
- Multi-currency/tax/shipping sophistication
- Bundles and subscriptions
- Marketplace/multi-vendor
- B2B commerce
- Advanced personalization beyond the implemented deterministic, verified-account Audience/Experience capability (for example, randomized A/B testing). Production tenant-rule/consumer inventory and retention decisions are release follow-ups, not missing local audience functionality.
- Additional renderers
- Open-source distribution and app marketplace

## Correct next implementation

**Update 2026-10-04:** The local checkout-to-Orders evidence pass and the 11-component Commerce storefront expansion are complete. The callback previously verified was locally Nango-signed; real provider delivery remains separate under P0 item 2. The current storefront pass verifies published product loading in ProductInfo, collection, and search, plus cart quantity/removal; it did not exercise payment-provider checkout/callback.

Select the next feature from the remaining Commerce product backlog:

1. Inventory/order operations if operational correctness is the priority.
2. Real public Stripe webhook/deployment work to complete external payment delivery.

The machine engine, capability idempotency, provider receipt path, Evidence projection, seed architecture, and Orders read view should not be reimplemented. They are already present and verified.

## Verification baseline (recorded 2026-09-14)

This is the historical baseline captured on the initial roadmap date; later verification is recorded in the linked implementation and dated E2E documents. The repository baseline at that time was:

```text
pnpm exec biome check .  → pass
pnpm test                → 150 files / 530 tests pass
pnpm build               → pass, existing browser bundle warnings only
pnpm seed:demo           → pass
pnpm seed:demo:commerce  → pass
pnpm seed:demo:full      → pass
```

This document should replace the older status documents as the planning reference for the next work item.
