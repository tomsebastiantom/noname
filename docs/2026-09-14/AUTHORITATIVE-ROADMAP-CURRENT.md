# Noname Authoritative Roadmap — Current Code Truth

Date: 2026-09-14
Status: Reconciled against the current repository and verified implementation records

## Why this document exists

Several earlier roadmap/status documents are now stale because implementation continued after they were written. In particular:

- `docs/2026-08-21/CURRENT_STATUS.md` predates the Commerce checkout hardening, Evidence Kernel, Orders admin, seeding package, and fixture package.
- `docs/2026-09-09/COMMERCE-HARDENING-IMPLEMENTATION.md` still says checkout workstreams are pending even though the final live verification record exists.
- `docs/2026-09-10/CHECKOUT-RELIABILITY-PLAN.md` contains the original plan and historical baseline; its implementation status is superseded by the 2026-09-12 verification record.
- `docs/2026-09-12/EDGE-SEO-PRERENDER-IMPLEMENTATION.md` says personalization is next, but `EDGE-PERSONALIZATION-IMPLEMENTATION.md` records that work as complete.
- The older roadmap assumes a `packages/server/src/domains/commerce` domain. Current architecture deliberately keeps Commerce behavior in `packages/verticals` and Commerce UI/actions in the Commerce extension.

This document is the current planning source. Earlier documents remain historical evidence and design rationale, not current status.

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
- Live Stripe Sandbox checkout and signed callback-to-paid verification

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

The Orders page has been verified with deterministic seeded Evidence. The remaining proof is the live paid checkout result appearing in the Orders projection in the same run.

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

Current extension components are intentionally small. Remaining likely components:

```text
ProductGrid
ProductInfo
CartDrawer
CartSummary enhancements
CheckoutButton variants
CollectionPage
SearchResults
Pagination
```

Each component must remain Commerce extension-owned and use catalog edit metadata.

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
- Advanced personalization and A/B testing
- Additional renderers
- Open-source distribution and app marketplace

## Correct next implementation

The next implementation should be a focused **live checkout-to-Orders verification and release evidence pass**, not another foundational rewrite.

If that pass succeeds, the next feature should be selected from the Commerce product backlog:

1. Inventory/order operations if operational correctness is the priority.
2. ProductGrid/ProductInfo/storefront components if merchant storefront completeness is the priority.
3. Real public Stripe webhook/deployment work if preparing for external environments.

The machine engine, capability idempotency, provider receipt path, Evidence projection, seed architecture, and Orders read view should not be reimplemented. They are already present and verified.

## Verification baseline

The current repository baseline is:

```text
pnpm exec biome check .  → pass
pnpm test                → 150 files / 530 tests pass
pnpm build               → pass, existing browser bundle warnings only
pnpm seed:demo           → pass
pnpm seed:demo:commerce  → pass
pnpm seed:demo:full      → pass
```

This document should replace the older status documents as the planning reference for the next work item.
