# Commerce Order Operations — Implementation Plan

**Original plan date:** 2026-10-04 (America/Toronto)
**Status:** First-release source implementation complete; focused tests/typechecks, local schema push, and targeted browser smoke verified; full database-concurrency/provider E2E remain pending
**Implementation checkpoint:** 2026-10-07 (America/New_York)
**Scope:** Order Operations, the selected largest product feature
**Owner:** Commerce vertical and Commerce extension, using generic platform contracts

## Executive recommendation

Extend the existing Commerce vertical and Commerce extension rather than creating `packages/server/src/domains/commerce`. Keep four concerns distinct:

```text
Commerce order aggregate and invariants
  → generic, authorized capability/query runtime
  → Commerce-owned extension actions and Orders UI
  → immutable Evidence facts and links
```

The starting Orders page was an Evidence-backed, read-only view. Evidence remains append-only provenance, not mutable order state. The first-release implementation builds the order read surface and commands on Commerce capability registrations plus the generic machine instance; the generic machine schema/engine owns revisioned persistence/search mechanics, while the vertical and extension own order semantics and presentation. Reuse generic capability execution, integrations, Evidence, and workers; do not put Commerce branching or provider-specific order logic into those shared domains.

**Recommended first release:** durable, currency-correct order details and bounded search/detail reads for confirmed-paid orders; an Orders admin UI with server-enforced view permission; then manual cancellation of eligible unfulfilled orders and manual fulfillment updates as explicit, audited commands. Support multiple enabled currencies as separate single-currency orders (no FX conversion); treat refunds, inventory reservations, and customer self-service history as separate gated slices because they need additional provider reconciliation, concurrency, or identity work.

## Implementation decision and status (2026-10-06)

The first-release implementation follows the existing generic machine architecture: the canonical immutable checkout snapshot and order lifecycle remain in the generic cart machine instance context; the Commerce vertical owns order semantics and capability handlers; generic machine revision/CAS, tenant-scoped search, and append-only transition records provide persistence and concurrency. No Commerce-specific table/domain or Orders endpoint was introduced. The existing `POST /api/capabilities/:capability` route has metadata-driven query/command policy, installation/resource checks, fail-closed command idempotency, atomic retry claims with per-attempt fencing, and actor-bound request hashes. Order detail reads use the generic Evidence service internally under the authorized capability; broad Evidence record, audit, and link reads filter Commerce records by the existing Orders-view permission.

Source includes trusted catalog-currency snapshots (CAD/USD enabled by default), exponent-aware integer money helpers, paid-order search/detail, manual cancellation without implied refund, manual fulfillment, and the extended existing OrdersAdmin surface. Checkout reserves the cart with a revision-checked transition before provider side effects, reuses a stable cart-scoped provider idempotency key, and stores a paid timestamp. Stripe success normalization requires a settled `payment_status`, maps asynchronous success, and the XState guard reconciles callback amount/currency with the reserved snapshot. The broad focused suite passed 95 tests across 15 files, including a component integration of Commerce settlement mapping through the provider worker into the generic XState engine; package typechecks and Biome checks passed. On 2026-10-07, the existing local Podman database received the current Drizzle schema push (no volume reset or reseed). A targeted browser smoke verified login, storefront cart addition, and Orders search/detail through the existing capability route; the live `commerce.orders.search` and `commerce.orders.get` calls returned HTTP 200. Legacy OrdersAdmin defaults and the intentional platform→Commerce Pagination override were fixed; the verified page had no console errors or warnings. This is partial local smoke proof only: PostgreSQL cursor/idempotency race tests, Stripe sandbox checkout/callback replay, and public Stripe→Nango delivery remain unperformed and must not be inferred.

The generic machine-context approach resolves the plan's earlier storage fork and supersedes proposed `CommerceOrderPort`/Commerce-table directions below. Machine revision/context-date search and capability attempt-fencing schema changes use the existing Drizzle schema-push path; the current schema has been applied only to the existing local Podman test database, with persistent volumes preserved. This local push is not production migration approval. XState remains the transition authority, and no vertical-specific persistence branch was added.

## 1. Planning authority and documentation review

Use the [authoritative roadmap](../2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md) for current status. Its deferred Commerce list names cancellation, refunds, fulfillment, inventory reservation/decrement, customer history, customer/email search, cursor pagination, an order detail aggregate, and payment/refund reconciliation. The roadmap directs this work to Commerce vertical capabilities and Commerce extension actions, with narrow server ports only where needed.

The completed [documentation audit index](../2026-09-14/DOCUMENTATION-AUDIT-INDEX.md) records the repository-wide audit method and freshness classifications. Older dated implementation documents and research remain useful for evidence/design rationale, but their old “next” items and status claims are not current planning authority.

### Current architecture and evidence consulted

- [Package boundaries](../../apps/docs/docs/architecture/package-boundaries.md) and [platform capability map](../../apps/docs/docs/architecture/platform-capability-map.md): generic platform primitives belong in server domains; Commerce semantics belong in the vertical; Commerce UI/actions belong in the extension.
- [Generic capability runtime decision](../2026-09-09/DECISION-GENERIC-CAPABILITY-RUNTIME.md), [generic machine routes decision](../2026-09-09/DECISION-GENERIC-MACHINE-ROUTES.md), and [XState/queues/event bus decision](../2026-09-09/DECISION-XSTATE-QUEUES-EVENT-BUS.md): capability execution is generic; XState decides machine transitions; BullMQ is durable work; the event bus is notification fan-out.
- [Nango forwarded-webhook design](../2026-09-09/NANGO-FORWARDED-WEBHOOKS-XSTATE.md): outbound provider work and inbound callbacks stay behind the Integrations/Nango boundary and are normalized before machine transitions.
- [Orders admin implementation](../2026-09-12/ORDERS-ADMIN-IMPLEMENTATION.md): the existing `/admin/orders` view reads generic Evidence records, links, and audit; it does not mutate orders.
- [Evidence implementation](../2026-09-12/EVIDENCE-PROVENANCE-IMPLEMENTATION.md) and [auditable-records research](../2026-09-12/AUDITABLE-RECORDS-RESEARCH.md): aggregates, immutable events/records, and query projections are separate concepts; the order aggregate and read model are Commerce-owned.
- [Identity and platform integrations](../../apps/docs/docs/architecture/identity-and-platform-integrations.md), [extension lifecycle](../../apps/docs/docs/architecture/extension-lifecycle.md), and [manual verification checklist](../MANUAL-VERIFICATION-CHECKLIST.md): tenant scope is server-derived; extensions own their behavior; implementation verification records must include API and UI checks.

### Freshness notes

- The roadmap header says its latest targeted update is 2026-10-03 while its storefront update is dated 2026-10-04. This plan is dated using the current local date, 2026-10-04. Treat the roadmap's order-operations section as the relevant deferred-work inventory, and verify current source before any implementation decision.
- The roadmap’s remaining storefront-layout live-verification note is superseded by the later storefront/browser verification described in the current working context; it is not a prerequisite for order operations.
- Local Stripe Sandbox checkout and a locally Nango-signed callback do **not** establish real public Stripe→Nango webhook delivery. Keep that external delivery proof as a separate production gate; do not make it a claim of this feature.

## 2. Current baseline and concrete gaps

At baseline review the source had a generic `POST /api/capabilities/:capability` route, handler registry, durable idempotency storage, Commerce checkout contribution, and XState machine engine. Commerce projected `PAYMENT_SUCCEEDED` into immutable order/payment Evidence, while the Orders UI was read-only. The first-release source changes address the following baseline gaps without adding an Orders endpoint or Commerce persistence domain:

1. **Capability access policy — implemented:** generic descriptors now distinguish query/command, permissions, installation requirements, and pre-replay resource authorization. Administrative commands do not inherit storefront/customer access.
2. **Installation gate — implemented:** the existing generic capability route resolves extension installation before execution.
3. **Read-query contract — implemented:** queries execute fresh without mutation-result idempotency replay; commands require a durable key and fail closed if the idempotency store is unavailable.
4. **Order concurrency — implemented in source:** generic machine transitions use revision/CAS and append successful transition records transactionally. Checkout reserves the cart before external provider work; cart-scoped provider idempotency prevents multiple Stripe sessions. Failed/expired command-idempotency claims are atomically reclaimed and stale attempts are fenced. Real PostgreSQL race verification remains pending.
5. **Currency/amount integrity — implemented in source:** trusted catalog currency, same-currency cart validation, exponent-aware integer minor units, immutable snapshots, and UI formatting cover CAD/USD by default plus JPY/KWD helpers.
6. **Server-side authorization — implemented in source:** capability permissions protect order reads/commands; generic Evidence route policies filter protected Commerce records and links; tenant scope remains server-derived.
7. **Provider settlement and order-date correctness — implemented in source:** Stripe success requires `payment_status=paid`, delayed async success is mapped, machine guards compare callback amount/currency to the snapshot, and order search/display use immutable `paidAt` with a legacy `createdAt` fallback.

Database schema push and real PostgreSQL integration remain release gates; the completion statements above describe source implementation and passing focused tests, not live database or provider proof.

Relevant implementation surfaces include the generic [capability registry](../../packages/server/src/domains/capabilities/registry.ts), [capability routes](../../packages/server/src/domains/capabilities/routes.ts), [capability idempotency store](../../packages/server/src/domains/capabilities/idempotency.ts), [machine engine](../../packages/server/src/domains/machines/engine.ts), [machine storage port](../../packages/server/src/domains/machines/ports.ts), [Commerce capabilities](../../packages/verticals/src/commerce/capabilities.ts), [order Evidence projector](../../packages/verticals/src/commerce/order-projection.ts), and [Orders admin extension](../../packages/extensions/src/commerce/orders-admin.tsx).

## 3. Target ownership and design principles

### Ownership

| Concern | Owner | Boundary |
|---|---|---|
| Generic capability/query dispatch, auth metadata, input bounds, idempotency, installation checks, tracing | `packages/server/src/domains/capabilities` (generic) | No Commerce names/branches in the generic route; registration supplies metadata. |
| Order meaning, snapshots, rules, command contracts, event normalization, order projection | `packages/verticals/src/commerce` | Keep business meaning in the vertical; never accept tenant identity or trusted prices from the browser. Persist the immutable snapshot/lifecycle in generic machine context. |
| Durable storage adapter and transaction wiring | Generic machine storage adapter composed by server bootstrap | Generic revision/CAS/search/index primitives are vertical-neutral; do not create a `domains/commerce` branch or make the vertical import server internals. Apply the machine schema changes through the existing Drizzle schema-push path. |
| Orders list/detail/actions and customer-facing presentation | `packages/extensions/src/commerce` | The client shell remains generic; hide/disable actions for presentation, but do not rely on UI checks for security. |
| Immutable order/payment/operation facts, audit actor, correlation and links | Generic Evidence service, called by trusted Commerce effects | Append facts after authoritative successful transitions; no Evidence mutation endpoints and no mutable order state in Evidence. |
| Provider credentials, proxy calls, callback ingress and receipt queue | Generic Integrations/Nango/worker primitives; mapping in Commerce | No direct provider SDK/secrets or provider payloads in machines/webhooks generic code. |

### State and persistence principles

- Treat a confirmed `PAYMENT_SUCCEEDED` transition as the initial paid-order creation trigger, matching the current projection. Do not infer payment success from the redirect or browser input.
- Keep order lifecycle, payment/refund lifecycle, and fulfillment lifecycle distinct. “Cancel” must not silently imply “refund”; refund confirmation must not be inferred from requesting a refund.
- Snapshot purchased product identifiers, display fields, quantities, integer minor-unit amounts, ISO currency code, and relevant customer/order references at order creation. Each order/cart uses one currency; different orders may use different enabled currencies. Resolve currency from trusted tenant/catalog pricing configuration, verify every line uses that currency, and never let a caller-supplied cart currency reinterpret a decimal price. Later CMS edits must not rewrite historical purchases. Minimize retained customer PII and document access/retention needs before storing address/contact snapshots.
- Make currency exponent-aware end to end: do not assume every ISO currency has two decimal places or multiply/divide by 100 universally. Reuse and extend the existing Commerce price-formatting/pricing path rather than creating a new generic money service. Support enabled currencies as independent amounts only; FX conversion, mixed-currency orders, and cross-currency totals are out of scope unless separately approved.
- Use a stable internal order ID and a separate non-secret public reference if customers will see orders. Keep every lookup and mutation tenant-scoped.
- Add optimistic versioning/compare-and-swap (or an equivalent transactional lock) to state-changing order commands. Expected revision mismatches return a conflict and require a fresh read; concurrent commands must not both succeed against the same stale revision.
- Keep XState as the transition authority for workflow transitions. **Decision:** order states are transitions on the existing Commerce cart machine; successful state plus immutable order snapshot remain in generic machine instance context. The generic engine commits each transition with expected-revision compare-and-swap and appends the successful transition record in one transaction. Do not add a second status-transition authority or Commerce-specific storage table.
- The machine transition and successful transition record are transactionally committed. Evidence projection is idempotent and recoverable through persisted-transition replay when a capability retry follows a projection failure; the in-memory event bus is not business execution or durable delivery.
- Use the generic machine instance as the order query projection and lifecycle store. Do not add Commerce order columns/tables to Documents or Commerce semantics to generic Evidence. Order-specific snapshot validation, state meaning, and operation rules remain in the Commerce vertical.

## 4. Proposed API and permission shape

These are capability registrations, not new server routes. **Do not add an Orders-specific endpoint.** Order queries and commands use the existing `POST /api/capabilities/:capability` URL (for example, `commerce.orders.search` or `commerce.orders.cancel`). Authorized order detail composes Evidence records/links through the generic Evidence service internally; no Commerce Evidence endpoint was added. Do not add `/api/orders`, `/api/commerce/orders`, `/api/queries`, or another Commerce route.

Add strict Zod input/output contracts, bounded payloads, and schema tests. For query registrations on the existing capability route, skip mutation-result idempotency replay; require `Idempotency-Key` only for commands. Do not introduce a second query transport to work around the current handler contract.

### Generic runtime descriptors

Evolve capability registration from `name → handler` to a generic descriptor with at least:

- operation kind: `query` or `command`;
- required permission (or generic authorization policy reference);
- owning extension/install requirement;
- bounded input/output schema and execution limits;
- `authorize(context, input)` for resource-level checks that must run before a stored command result can be replayed;
- command idempotency policy. Queries are not memoized as mutation results.

Keep `orgId`, `actorId`, request ID, and idempotency key in server-built context. Do not add caller-controlled `orgId`, arbitrary `actorId`, or authorization flags to request DTOs. Require authenticated staff for order admin commands; there is no public-key grant for read, cancel, fulfill, or refund operations.

### Commerce operations (first and later slices)

| Proposed capability | Kind | Required permission | Input/result intent |
|---|---|---|---|
| `commerce.orders.search` | Query | `commerce:orders_view` | `{ cursor?, limit?, search?, paymentStatus?, fulfillmentStatus?, createdFrom?, createdTo? }`; stable opaque cursor, bounded page (recommended default 25, maximum 50); return summary rows and `nextCursor`. |
| `commerce.orders.get` | Query | `commerce:orders_view` | `{ orderId }`; return a tenant-scoped detail snapshot, current aggregate revision, payment/fulfillment facts, and links to immutable evidence where authorized. |
| `commerce.orders.cancel` | Command | New `commerce:orders_manage` (or approved equivalent) | `{ orderId, expectedRevision, reason }`; require `Idempotency-Key`; in the first paid-order slice, permit only eligible paid/unfulfilled orders; append actor/reason provenance. Cancellation does not imply refund, and pre-payment cart cancellation remains separate. |
| `commerce.orders.fulfill` | Command | `commerce:orders_manage` | `{ orderId, expectedRevision, fulfillmentRef?, carrier?, trackingNumber? }`; require `Idempotency-Key`; only allow eligible paid/non-cancelled orders; decide whether first release is manual fulfillment tracking only. |
| `commerce.orders.refund` | Command (later) | `commerce:orders_manage` | `{ orderId, expectedRevision, amountMinor?, reason }`; provider-specific effect through Nango; return pending operation/refund reference, not “refunded” until authoritative normalized confirmation. |
| `commerce.orders.mine` | Query (later) | Authenticated customer identity | `{ cursor?, limit? }`; derive actor from authenticated context and scope to that actor; never accept arbitrary customer ID/email as authority. Guest access needs a separately designed narrow, expiring grant. |

The generic query contract should not require a durable mutation idempotency key or reuse a 24-hour cached result. For commands, retain org+operation+key request hashing and replay/conflict/in-progress semantics; add actor/resource-aware authorization before replay and document whether actor identity participates in the idempotency scope/hash. A replay must not bypass current permission, installation, tenant, or order-ownership checks.

`commerce:orders_view` already exists for the current UI. Add a least-privilege manage permission and explicit role mapping before shipping commands. Admin may receive it by default; decide whether any other current platform role should. Do not infer permission from route visibility or a role label in the browser.

### Error contract

Use generic normalized errors with stable semantics: `400` invalid bounded input/cursor; `401/403` authentication/permission denial; `404` absent or cross-tenant order (avoid cross-tenant existence leaks); `409` stale revision, invalid lifecycle transition, or idempotency conflict/in-progress; `422` valid shape but rejected business rule; retryable `5xx`/operation-pending only where the generic runtime supports it. Never return provider secrets or raw provider payloads.

### UI component reuse — extend the existing Commerce Orders surface

The current [OrdersAdmin component](../../packages/extensions/src/commerce/orders-admin.tsx) already supplies the Commerce-owned admin table, selectable row, inline detail panel, refresh/loading/empty/error states, and evidence-link display. Extend that component and the existing [Commerce actions](../../packages/extensions/src/commerce/actions.ts), [Orders API adapter](../../packages/extensions/src/commerce/orders-admin-api.ts), [catalog schemas](../../packages/extensions/src/commerce/catalog-schemas.ts), and seeded `admin_orders` layout. Keep the same `/admin/orders` route and generic admin shell.

Required UI changes are additions to that surface, not a new UI framework:

- Add search and bounded filter controls (order/public reference, permitted customer lookup, payment/fulfillment status, date, currency) and next/previous cursor controls.
- Expand the row/detail presentation with explicit order, payment/refund, and fulfillment status; show amounts with their currency on every row and in detail.
- Add cancel/fulfill controls only in eligible states, with a reason/tracking form where appropriate, confirmation, pending state, failure/retry, stale-version refresh, and immutable activity/audit display.
- Keep the existing loading, empty, forbidden, and error affordances; add labels to the extension-owned catalog schema rather than hard-coding admin-shell copy.
- Prefer small Commerce-internal helpers inside the existing extension when the component becomes too large. Do not add a new generic admin route, platform component, or design-system dependency for this feature. The client package’s local `src/components/ui` files are not an extension public API; do not deep-import them. Reuse the current extension’s semantic HTML/Tailwind patterns unless a supported cross-package UI contract already exists.
- For currency, reuse/extend the existing Commerce [`formatProductPrice` helper](../../packages/extensions/src/commerce/product-catalog.ts) and trusted checkout pricing path rather than adding a second formatter or UI-only conversion rule.

## 5. Phased implementation sequence

### Phase 0 — Contract and architecture decision

1. Agree lifecycle vocabulary and allowed transitions for order, payment/refund, and fulfillment; define what cancellation means for paid vs unpaid orders and establish whether an order starts at confirmed payment or earlier.
2. Decide the XState/aggregate transaction boundary and how version checks, replay, and concurrent commands work. Include the current flat machine-state limitation in the decision.
3. Define order snapshot fields, PII minimization/retention, public-reference behavior, and legacy Evidence-only order treatment.
4. Define capability descriptor metadata, per-operation permission mapping, extension installation check, query-vs-command behavior, and authorization-before-idempotency-replay.
5. Record a short ADR for physical storage adapter/schema placement. Keep business meaning in Commerce; do not introduce `server/domains/commerce`.

**Exit:** the transition, permission, generic machine-context persistence, transaction, and bounded API contracts are recorded above and implemented in source. The original storage fork is resolved; database verification remains outstanding.

### Phase 1 — Generic capability security and read-query support

**Status:** implemented in source; generic route tests pass. Live service-level verification remains pending.

1. Extend generic registration with query/command metadata, required policy, installation requirement, bounded schemas, and resource authorization hook.
2. Resolve extension installation from tenant-scoped server state before dispatch. Retain explicit narrowly allowlisted public-access behavior only for operations that genuinely need it; Commerce order operations are staff-only.
3. Preserve durable command idempotency and ensure handler-level authorization is not bypassed by replay. Give queries bounded execution and stable request tracing but no cached command-result replay.
4. Add generic route tests for unknown operation, install missing, anonymous caller, each permission class, changed body with same key, same-body replay, in-progress, retry after failure, and cross-org isolation.

**Exit:** the platform can safely register an example query and command without adding a Commerce-specific server route.

### Phase 2 — Durable paid-order aggregate and read model

**Status:** implemented in source; focused currency/order/UI tests and package typechecks pass. Schema push and real PostgreSQL cursor/query checks remain pending.

1. Define Commerce-owned domain DTOs and validation in the vertical. Build trusted product/line snapshots from server catalog/cart context, revision-reserve the cart before provider side effects, and persist the snapshot in generic machine context. Reject mixed-currency carts and never trust browser/cart currency to reinterpret catalog prices.
2. Reuse the generic machine storage adapter with revision/CAS, transition records, tenant-scoped indexes, context-date search, and precision-safe cursor comparison. Additive machine/capability schema changes go through the existing Drizzle schema-push path; no Commerce table or migration was added.
3. Project one order/payment Evidence fact set from an authoritative settled payment transition. Keep provider session creation idempotent and retry-safe; correlate the Evidence projection with persisted transition parameters and machine instance.
4. Test currency conversion/formatting with two-fraction currencies (CAD/USD), a zero-fraction currency (JPY), and a three-fraction currency (KWD); checkout defaults to CAD/USD pending explicit provider enablement for more currencies.
5. Treat legacy paid cart-machine instances with payment facts but no immutable snapshot/`paidAt` as partial detail and fall back to cart creation date. Do not synthesize standalone Evidence rows without a matching machine aggregate or fabricate customer, line, or fulfillment data; define any backfill separately if such rows are found.
6. Register `commerce.orders.search` and `.get` as query operations on the existing generic capability route; search/paginate by immutable `paidAt` (with legacy fallback), use bounded tenant-filtered queries and a stable opaque cursor, and do not load a tenant’s entire order set into browser memory. Current search supports order/payment references; customer/email search remains deferred.
7. Extend the existing Commerce Orders extension UI with detail, search/filter, cursor pagination, loading/empty/error states, localized state labels, and permission-aware presentation. Keep current Evidence links/audit inspection.

**Exit:** paid checkout creates one durable queryable order; reload and second process observe it; list/detail never return another tenant’s order; legacy records are clearly marked partial.

### Phase 3 — Admin cancellation and manual fulfillment

**Status:** implemented in source with revisioned capability commands and append-only actor/reason Evidence; browser and database race verification remain pending.

1. Implement only the approved first-release transitions through XState/selected transactional transition boundary.
2. Cancellation: for the first paid-order slice, permit only eligible paid but unfulfilled orders; reject already fulfilled/cancelled orders; include a bounded operator reason; do not auto-refund. Pre-payment cart/checkout cancellation remains separate; if payment is captured, a refund requires the separate refund operation/policy.
3. Fulfillment: initially consider a manual “mark fulfilled” operation with optional carrier/tracking data rather than claiming a carrier integration exists. Reject cancelled/unpaid orders and duplicate or stale updates according to the transition table.
4. Emit immutable Commerce activity/audit facts with actor, reason, timestamp, correlation/causation, and idempotency. Persist/replay the aggregate/evidence update safely.
5. Add confirmation dialogs, progress and retry states, conflict refresh behavior, and visible audit/activity history to the Commerce extension.

**Exit:** eligible authorized staff can cancel or fulfill through a command; every state change is concurrency-safe and auditable; retries cannot duplicate effects.

### Phase 4 — Refunds and reconciliation (separate provider-gated release)

1. Specify full/partial refund limits, cumulative amount rules, currency/minor-unit arithmetic, permission/reason requirements, and repeated/partial refund behavior.
2. Add Commerce provider-neutral refund request/response ports; keep credentials and outbound execution in Integrations/Nango. No direct Stripe API or secrets in Commerce handlers, machine code, or the webhooks domain.
3. Treat provider submission as an operation with durable idempotency and pending state. Normalize inbound provider events in Commerce mapping; ingress/receipts/worker remain generic integrations infrastructure; XState applies the confirmed transition once.
4. Add reconciliation for pending/missing/duplicate/out-of-order provider outcomes, and operator-visible recovery state. Do not mark refunded solely because the request was accepted.
5. Verify against provider sandbox and a deterministic fake adapter. Keep actual public Stripe→Nango→app delivery as a separate production proof gate until exercised in the deployed topology.

**Exit:** refunds are provider-confirmed, tenant-bound, idempotent, reconciled, and auditable; uncertainty is surfaced rather than hidden.

### Phase 5 — Inventory and customer history (separate scope gates)

- **Inventory:** define stock ownership, reservation expiry, release on abandoned/failed checkout, decrement timing, oversell policy, and idempotent restock. Implement reservations with atomic conditional updates/locking and concurrency tests before claiming stock correctness. Inventory is not an incidental field update on an order.
- **Customer history:** introduce a minimal customer reference and a server-derived actor query. For guest orders, design a scoped expiring verification grant; email search is not authentication. Limit exposed PII and define retention/deletion policy.

The order model and admin surface must support each explicitly enabled per-order currency with correct minor-unit handling; FX conversion, mixed-currency orders, cross-currency rollups, tax/shipping sophistication, subscriptions, and marketplace are out of scope for this slice. Do not block the first admin order-management slice on those unrelated expansions or a full customer identity system. Do block inventory-sensitive sales claims on real reservation semantics.

## 6. Data and migration checklist

- New tables/columns have tenant-aware indexes and a documented migration path; order list queries begin with `orgId` in every query predicate.
- Snapshot canonical order data; never derive historical totals from current editable product documents. Store money as integer minor units plus ISO currency and the validated currency exponent/scale; do not assume two fraction digits.
- Use stable uniqueness/idempotency constraints for source paid transition and payment reference. Clarify handling when one payment maps to more than one order or vice versa before coding.
- Use optimistic aggregate revision or equivalent transactional lock; include expected revision in commands and test simultaneous writes against real Postgres.
- Evidence records, activities, links, and audit remain append-only; immutable facts describe transitions while the order aggregate/read model describes current state.
- Define retention/redaction behavior for customer PII without rewriting immutable payment/order facts in place. If redaction/tombstones are required, follow a documented generic policy.
- New migrations and schema declarations follow current Drizzle configuration/verification paths; do not hand-edit production data or silently rewrite old Evidence.
- Seed only deterministic fixtures for stable UI examples. Keep deterministic fixtures separate from behavioral checkout/provider E2E; never present fixtures as live provider proof.

## 7. Verification plan

A separate behavioral scenario/runbook is now specified in the [Order Operations E2E Test Plan](./ORDER-OPERATIONS-E2E-TEST-PLAN.md). Add a dated API/UI entry to [`MANUAL-VERIFICATION-CHECKLIST.md`](../MANUAL-VERIFICATION-CHECKLIST.md) when implementation begins. Automated tests are required, but the manual checklist also requires API and UI sections even when one side is thin. Keep seeded fixture checks distinct from behavioral E2E, following the [fixture architecture analysis](../2026-09-14/TEST-FIXTURE-ARCHITECTURE-ANALYSIS.md).

### API and persistence checks

- Exercise requests through the supported edge/public routing topology; do not treat a direct server-port request as equivalent to the user path.
- Verify no token, absent permission, insufficient permission, uninstalled extension, or caller-supplied organization can read or mutate another tenant’s orders.
- Verify `commerce:orders_view` can query but cannot invoke commands; `commerce:orders_manage` can only perform allowed commands; public publishable keys cannot access order admin/customer history.
- Verify list/detail schema bounds, maximum page size, malformed/expired cursor handling, stable cursor ordering during inserts, and customer/email search isolation.
- Verify every order amount is paired with a validated currency; mismatch between configured/catalog price currency and cart currency is rejected; mixed-currency carts fail closed; CAD/USD, JPY, and KWD minor-unit conversion and formatting are correct; no cross-currency total or implicit FX conversion is shown.
- Verify cancellation/fulfillment transition matrix, required reason/confirmation data, stale revision conflict, invalid state rejection, and immutable actor/reason audit evidence.
- Race two distinct command keys against the same revision; exactly one state transition must win. Race duplicate requests with the same idempotency key; observe one effect and deterministic replay. Test changed payload conflict, in-progress, failure retry, and authorization before replay.
- Verify confirmed paid callback creates exactly one order; failed/expired/duplicate/wrong-tenant/unmapped events create no false paid order. Exercise durable receipt worker retry and recovery after process restart.
- For storage, migration, cursor queries, idempotency, and concurrency, include integration tests against real Postgres (and Redis/BullMQ for asynchronous provider-event behavior), not only in-memory fakes.
- For refunds, verify sandbox request→normalized confirmation and failure/reconciliation; report local signed callback and real external delivery separately. No assertion that public provider delivery passed without end-to-end evidence.

### Browser/API behavioral checks

1. Log in as an admin with `commerce:orders_view`; open `/admin/orders`; confirm an order from a completed paid checkout appears with the immutable purchased snapshot, correctly formatted amount and currency, status dimensions, and evidence/activity links.
2. Verify orders in at least two enabled currencies render independently and correctly; include representative zero- and three-fraction currency formatting in a fixture/detail check. Confirm the UI never adds different currencies together or implies an FX conversion.
3. Reload and reopen detail; confirm data persists, cursor pagination/search/filter work, and stable empty/loading/error states are understandable.
4. Log in with view-only permission; verify cancel/fulfill/refund controls are absent or disabled and direct API commands are denied server-side.
5. As an authorized operator, cancel an eligible order: see a confirmation/reason step, submit once, observe the new state and audit entry, refresh, and verify retry does not duplicate the action. Try a stale second tab and confirm a conflict/reload path.
6. Fulfill an eligible order and verify tracking/reference and activity after reload; attempt unpaid/cancelled/ineligible orders and confirm actionable errors without state change.
7. Verify unauthorized navigation/direct URL/API access, cross-tenant order IDs, customer PII visibility, and any guest-order access fail closed.
8. For refunds, verify pending vs confirmed vs failed states in UI, and do not display “refunded” until authoritative normalized confirmation.
9. If inventory is in scope for a release, perform two concurrent checkouts for the last unit and verify no oversell; test expiry, failed payment, cancellation, and idempotent release.

## 8. Acceptance criteria and release gates

The first release is ready when:

- All order queries and commands use the existing `POST /api/capabilities/:capability` route; no Orders-specific server endpoint or route is added.
- The generic runtime applies registered authorization/install policy server-side and distinguishes query from command idempotency on that same route.
- A confirmed payment creates one tenant-isolated, reloadable order with a stable historical item/price snapshot, validated currency scale, and revision.
- The Orders UI can search, filter, paginate, and inspect order detail using bounded server queries.
- Any enabled order command is an authorized, XState-governed (or explicitly ADR-approved equivalent) transition with atomic concurrency protection, audit evidence, and safe retries.
- Cross-tenant, view-only, anonymous, stale, duplicate, and invalid-state tests fail closed.
- API integration and real-browser checks pass and are recorded in the manual checklist.
- No provider delivery, inventory reservation, refund reconciliation, or customer-history capability is claimed until its separate acceptance gate passes.

## 9. Non-goals for this plan

- Creating `packages/server/src/domains/commerce` or putting Commerce actions into generic Evidence routes.
- Treating Documents as the order database or Evidence as mutable order state.
- Direct provider SDK/API calls, embedded provider secrets, or webhook handling in Commerce UI/machine routes.
- Adding speculative generic tables/abstractions before a second concrete vertical use case justifies them.
- Shipping fake refund success, browser-trusted pricing/customer identity, unbounded list endpoints, or email-as-authentication.
- Claiming real public Stripe webhook delivery based on local signed callback tests.
- Adding a new Orders-specific API path, endpoint/method, or generic UI toolkit for this feature; all operations reuse the current capability URL and existing Commerce admin component surface.
- Adding a standalone generic money/currency service or FX conversion for this feature; currency-safe behavior belongs in the existing Commerce pricing/snapshot path.

## 10. Implementation order summary

```text
0. Approve lifecycle, state authority, storage transaction, permissions, and capability/query contract
1. Harden generic capability descriptors, installation, authorization, and query behavior without changing the endpoint URL/method
2. Persist confirmed-paid, currency-correct Commerce order snapshots; add secure query projection and extend the existing admin detail/search surface
3. Add versioned, audited manual cancellation and fulfillment
4. Add Nango-routed refund operations and reconciliation behind provider proof
5. Add atomic inventory reservation and scoped customer history as separately gated slices
```

This order gets the existing Orders surface from “evidence-only read view” to a useful operational admin without turning platform core into a Commerce domain or pretending external provider, inventory, or customer identity semantics are already solved.
