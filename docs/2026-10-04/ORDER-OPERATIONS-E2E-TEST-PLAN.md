# Commerce Order Operations — Behavioral E2E Test Plan

**Date:** 2026-10-04 (America/Toronto)
**Status:** Partial local browser smoke executed 2026-10-07; full behavioral database and provider proof remain pending
**Related plan:** [Order Operations implementation plan](./ORDER-OPERATIONS-IMPLEMENTATION-PLAN.md)
**Purpose:** Define the real-stack API and browser proof required before releasing order reads/actions

## Execution log (2026-10-07)

- Applied the current Drizzle schema to the existing local Podman database after the cart-start smoke exposed a missing generic machine revision column. Persistent volumes were preserved; no reseed was run.
- Browser smoke covered local demo login, storefront cart addition, and authenticated Orders search/detail. The `commerce.orders.search` and `commerce.orders.get` calls used the existing generic capability route and returned HTTP 200.
- Fixed runtime defaults for older saved OrdersAdmin component props and made the platform→Commerce `Pagination` override explicit. The verified Orders page showed status/filter/action labels with no console errors or warnings.
- This did **not** exercise role-denial matrices, cancel/fulfill commands, database race/idempotency scenarios, Stripe sandbox checkout/callback replay, or public Stripe→Nango delivery. Those remain separate required gates below.

## 1. E2E boundary and endpoint constraint

This is a behavioral end-to-end plan, not a fixture-only test and not an implementation claim. It exercises the browser, existing edge routing, API, database, Commerce vertical, and the current provider-event path where applicable.

**Reuse the existing endpoint:** order search/detail and command capability names are dispatched through the existing `POST /api/capabilities/:capability` route. Examples such as `commerce.orders.search` and `commerce.orders.cancel` are capability registrations, not new route paths. Do not add or call `/api/orders`, `/api/commerce/orders`, a separate `/api/queries` endpoint, or another Orders-specific path. The authorized order-detail capability composes Evidence links/audit internally; any direct generic Evidence reads must obey its per-record permission filters.

The plan distinguishes these evidence levels:

1. **Unit/contract tests:** fast validation of Commerce rules, generic capability policy, money conversion, and UI state; not E2E proof.
2. **Real-service integration tests:** Postgres for aggregate/idempotency/concurrency, and Redis/BullMQ for durable event processing; not browser proof.
3. **Local behavioral E2E:** actual browser + supported edge + running API/worker + persistent local database; this is the required order feature proof.
4. **External provider E2E:** public deployed Stripe→Nango delivery is a separate production gate. A local signed callback or a deterministic fixture does not prove public delivery.

## 2. Preconditions

Do not run this plan until the relevant API/query/UI capabilities are implemented and the local stack is already available. Use Browser MCP for the actual browser scenarios and exercise APIs through the existing edge-routed URL. Follow the existing [local development guide](../../apps/docs/docs/get-started/local-development.md) and [manual verification checklist](../MANUAL-VERIFICATION-CHECKLIST.md); do not start a replacement server for this GUI or wipe shared data as part of an ordinary verification run.

Prepare the environment using existing supported Commerce seeding and authorization setup:

- One test store/org with Commerce installed and the existing `/admin/orders` surface.
- A second test org for tenant-isolation assertions.
- An operator with `commerce:orders_view` only and one with the approved `commerce:orders_manage` grant.
- A customer/storefront identity and guest cart only if those existing checkout flows are part of the selected test run.
- A published product whose server-trusted price/currency configuration is known. Configure at least two provider-supported currencies (recommend CAD and USD for sandbox checkout); keep each cart/order single-currency.
- A test payment integration connected through the existing Nango boundary. Record whether the callback was a local signed callback or real external provider delivery; never collapse those outcomes.
- A disposable test order set with one eligible paid/unfulfilled order, one already fulfilled order, one cancelled order, and one order in the second currency. Use deterministic fixtures for rendering-only edge cases, not to assert live payment behavior.

Record environment, revision, org aliases, actor roles, and test timestamps. Mask order/customer/payment IDs in reports and do not copy customer PII into screenshots or logs.

## 3. API contract checks on the existing capability route

Execute API checks through the supported edge path. Do not call the API server's direct port and treat that as the customer/admin path.

### Query operations

Use `POST /api/capabilities/commerce.orders.search` with the existing capability request envelope, and `POST /api/capabilities/commerce.orders.get` for detail. Exact operation names are registrations on the same generic route, not new endpoints.

Verify:

- The signed-in operator with `commerce:orders_view` can search and retrieve only same-org records.
- No token, an insufficient permission, an uninstalled Commerce extension, invalid bounded input, or another org's order ID fails closed without leaking existence.
- Search filters (order reference, payment reference, payment/fulfillment status, paid-date bounds, currency) and opaque cursor pagination are stable and bounded. Customer/email search is deferred; new rows between pages must not duplicate/skip existing rows under the documented cursor contract.
- Query responses are not cached as completed command results. Repeating a query returns current data and does not require mutation idempotency semantics.
- `orgId` and `actorId` come from authenticated server context, never from the request body. Customer history, if later implemented, derives its owner from authenticated identity.

### Command operations

Use the same `POST /api/capabilities/:capability` URL for every command and supply the existing `Idempotency-Key` header.

Verify cancellation and fulfillment for:

- valid command and expected revision;
- missing/oversized reason or invalid tracking data;
- wrong lifecycle state, cancelled/already fulfilled order, and unpaid order;
- stale `expectedRevision` conflict;
- duplicate same-key/same-body replay, same-key/changed-body conflict, concurrent in-progress, and retry after a failed attempt;
- authorization and resource ownership before returning a stored replay;
- exact one state transition, one required business effect, and one immutable activity/audit fact under retries.

Race two different command keys using the same expected order revision; only one command may commit. Race the same idempotency key concurrently; only one effect may execute. Verify these semantics against real Postgres, not just an in-memory fake.

For all calls, inspect the edge/API logs using request/correlation IDs without logging secrets or full PII. Confirm no new Orders-specific URL is called by either browser or test client.

## 4. Currency and amount E2E matrix

Currency support here means **multiple enabled per-order currencies**, not FX conversion:

- Every order has exactly one validated ISO currency. Different orders may have different currencies.
- Every line is priced in the same trusted currency as its cart/order. Reject mixed-currency carts and a client/cart currency that conflicts with catalog/store pricing.
- Store amounts as integer minor units using the currency's validated exponent/scale. Never assume `×100`/`÷100` is valid for every currency.
- Do not sum amounts across different currencies or imply a conversion rate. Refund amounts stay in the original order currency.
- A currency is enabled for live checkout only when the catalog price and current provider adapter support it.

### Required checks

| Currency case | Test input/example | Expected result |
|---|---|---|
| Two fraction digits — CAD/USD | Major amount `12.34` | `1234` minor units; provider receives exact currency and amount; order and UI display same currency/amount. |
| Zero fraction digits — JPY | Major amount `1234` | `1234` minor units; no accidental division/multiplication by 100; locale display has no fractional digits. |
| Three fraction digits — KWD | Major amount `12.345` | `12345` minor units; display and refund precision retain all supported fractional digits. |
| Currency mismatch | CAD-priced product with cart claiming USD | Reject before provider call; no order/payment fact is created. |
| Mixed cart | Items with different trusted currency codes | Reject before checkout; do not silently convert or add unlike amounts. |
| Unsupported provider currency | Enabled in catalog but not accepted by the selected provider adapter | Fail with a clear actionable error before checkout-session creation. |

Run the exponent cases as currency utility/service contract tests and as order-display fixture cases. Run sandbox checkout E2E only for currencies actually supported by the configured test provider. Fixtures demonstrate formatting only; they are not proof of provider currency support.

## 5. Browser behavioral scenarios

Use the actual local browser surface and test accounts; keep screenshots free of PII.

### A. Orders list and detail

1. Log in as the operator with order-view permission and open the existing `/admin/orders` page.
2. Confirm the paid order appears once with stable order/payment references, per-order amount/currency, independent order/payment/fulfillment states, and immutable paid date; no customer fields are promised in this slice.
3. Search and filter by allowed terms/status/date/currency. Move forward/back through cursor pages and confirm stable results.
4. Select an order and inspect its snapshot, evidence links, and immutable activity/audit history. Refresh, navigate away/back, and reload; persisted data remains consistent.
5. Verify the existing refresh, loading, empty, forbidden, error, and retry states remain usable on narrow and desktop viewports.

### B. Permission and tenant isolation

1. As a view-only operator, confirm search/detail work but mutation controls are not rendered or enabled.
2. Attempt a command directly via the generic capability route as view-only; expect server denial regardless of hidden UI.
3. Log into org B and attempt to query org A order IDs; expect a non-leaking denial/not-found result and no data in UI, API response, or evidence links.
4. As an anonymous visitor/public-key holder, attempt list/detail/cancel/fulfill; order admin operations must remain unavailable.

### C. Cancel an eligible order

1. As an authorized operator, open a paid/unfulfilled order and choose Cancel.
2. Confirm the UI asks for the required reason and clearly states cancellation does not itself refund a captured payment.
3. Submit once; verify progress state, new order/fulfillment status, and actor/reason activity.
4. Refresh and verify the result persists; retry with the same idempotency key and verify no duplicate effect.
5. In a second tab, submit against the old revision; verify a conflict and a clear refresh/retry path.
6. Try cancelled, fulfilled, unpaid, or wrong-org orders; confirm action is blocked and no state/audit mutation occurs.

### D. Record manual fulfillment

1. Open an eligible paid/non-cancelled order and submit the manual fulfillment details supported by the release.
2. Verify success state, tracking/reference display, activity, and persistence after reload.
3. Submit stale/duplicate/ineligible updates and verify correct conflict/rejection without duplicate fulfillment.

### E. Multi-currency display

1. View orders from at least two enabled currencies in the same list; every row shows its own currency and is not added into a misleading cross-currency total.
2. Open details and verify line, subtotal, total, and any refund display preserve the stored currency and exponent.
3. Use deterministic fixture records for JPY/KWD formatting if those currencies are not enabled for the sandbox provider. Confirm fixtures are visibly test data and do not appear as completed provider transactions.

### F. End-to-end paid-order creation

1. Before the sandbox run, submit two concurrent checkout capability calls with distinct command keys for one active cart; verify the revisioned reservation admits one provider-session creation; a retry of the reserved cart returns that same stable session.
2. Start at the existing seeded storefront and complete a real sandbox checkout using a known test product and enabled currency.
3. Follow the configured Nango/integrations ingress and durable provider-event worker path. Wait for authoritative normalized payment success; do not infer success from the redirect.
4. Confirm exactly one order is visible, its price/currency/items derive from trusted persisted cart/catalog context, and its Evidence links point to the expected payment facts.
5. Replay the same callback/receipt and verify no second order, duplicate activity, or duplicate order transition is created.
6. Repeat with unpaid completed, failed, expired, duplicate, and wrong-amount/wrong-currency callback payloads; verify none can make the cart paid or create a paid-order fact. Verify asynchronous success only pays when the provider reports settled status and the callback amount/currency match the stored snapshot.
7. Restart API/worker only as an approved test procedure; verify the durable order and queued/retry behavior survive. Do not wipe volumes or replace the server used by the current GUI as part of this ordinary smoke test.

## 6. Evidence and pass/fail report

Record a dated result with:

- stack/browser/API revision and whether local or deployed;
- actor permission set and masked org aliases;
- which scenarios passed/failed/not run, with reason;
- capability operation names and request IDs (not credentials or raw customer payloads);
- currency code and amounts in test-safe form;
- migration/schema revision and real-Postgres test result;
- whether callbacks were fixture, locally signed Nango ingress, sandbox-forwarded, or actual public provider delivery;
- redacted screenshots for browser failures/success paths where useful.

**Release pass requires:** all API and browser scenarios for the claimed scope pass; real-Postgres concurrency/idempotency checks pass; all order API calls use only the existing generic capability URL; currency mismatch and exponent tests pass; permission/tenant isolation fail closed; UI actions align with authoritative state and audit records.

A failed public webhook delivery test does not invalidate a clearly scoped local order-operations pass, but it remains an independent production go-live blocker if refunds/payment reconciliation rely on that delivery path. Never report local callback proof as public provider proof.

## 7. Later-slice E2E additions

Do not mark these passed until they are implemented and included in a release:

- **Refunds:** provider request through Nango; pending state; normalized confirmed/failed callback; duplicate/out-of-order callbacks; partial/full cumulative limits; reconciliation and operator retry; UI never reports refunded before confirmation.
- **Inventory:** two independent checkouts competing for the last unit; exactly one reservation; expiry/release on payment failure or abandonment; cancellation/restock idempotency; no oversell after process retry.
- **Customer history:** authenticated actor sees only own orders; caller-supplied IDs/emails cannot change scope; guest access uses a narrow expiring grant and leaks no PII.

Keep these release gates separate from the first admin order-read/cancel/fulfill E2E path.
