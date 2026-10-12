# Commerce Refund and Reconciliation — Implementation Plan

**Plan date:** 2026-10-08 (America/New_York)
**Status:** Partially implemented 2026-10-12 — provider submission and the completion mapping are in; live provider confirmation is unverified.
**Scope:** Refund operations through the existing generic capability architecture; no new Orders-specific endpoint, no `packages/server/src/domains/commerce`, no direct provider SDK in Commerce handlers.

## Implementation status (2026-10-12)

**Implemented**

- `createStripeRefundAdapter` — posts to `/v1/refunds` through the injected `ProviderProxy`, with
  `metadata[machineInstanceId]`/`metadata[orderRef]` for correlation and a per-revision
  `Idempotency-Key` (`commerce-refund:<instance>:<revision>`), so a retry cannot double-refund.
- `createRefundProviderRegistry`, wired into `createCommerceContribution` (the capability dep is
  optional, so other call sites are unaffected).
- `commerce.orders.refund` now **submits before transitioning** and fails closed:
  - no provider payment reference → error, **no** transition (previously it entered
    `refund_pending` with no way out, since only a provider event can complete it),
  - amount must be a positive integer and cannot exceed the captured amount,
  - only a `paid` order is refundable,
  - a missing provider registry produces a clear error rather than a silent state change.
- Provider refund events (`charge.refunded`, `refund.created`, `refund.updated`, `refund.failed`)
  are normalized to `REFUND_CONFIRMED` / `REFUND_FAILED` and applied by the existing
  provider-event worker. A **pending** refund deliberately produces no transition, so an order is
  never reported refunded before the provider confirms.

**Verified**

- 14 unit tests in `packages/verticals/src/commerce/refund-flow.test.ts`: the fail-closed guard, the
  submission payload (endpoint, idempotency key, correlation metadata), over-refund rejection,
  non-paid rejection, missing-registry error, adapter response handling, and the refund
  normalizers (confirmed / failed / pending / unattributable / `charge.refunded`).
- The stored `cart` definition in the local database accepts `REFUND_ORDER`, `REFUND_CONFIRMED`
  and `REFUND_FAILED`.
- Package typechecks and the full suite pass.

**Not verified**

- **No live provider round-trip.** The adapter is exercised only against a fake proxy; a real
  Stripe test-mode refund has not been submitted, and no real `charge.refunded` event has been
  received. Treat provider confirmation as unproven.
- Cumulative/partial refund accounting is not implemented: the guard prevents a single refund
  exceeding the captured amount, but two partial refunds that together exceed it are not prevented.
- Reconciliation of missing/out-of-order/duplicate provider outcomes, and refund Evidence
  projection, are still outstanding (§1.4, §1.8).
- A refund requested from a `fulfilled` order is rejected by the machine definition (the
  transition is only declared from `paid`); whether that is the intended policy is undecided.

**Architecture constraints (same as first-release):**
- Reuse `POST /api/capabilities/:capability` for the refund command.
- Persist durable refund-operation evidence (actor, reason, amount, currency, correlation, idempotency) through the generic Evidence service; do not add mutable Evidence mutation endpoints.
- Keep provider work and inbound callbacks in Integrations/Nango; normalize before applying the XState transition.
- Use the existing generic machine instance (cart machine) for refund-state tracking; add the `REFUND_ORDER` transition to the existing `cart.json` machine definition; commit atomically with revision/CAS.
- Use existing Commerce extension (`packages/extensions/src/commerce`) for the admin refund UI; no new platform admin route.
- Currency/minor-unit arithmetic must be exponent-aware; refunds remain in the original order currency (no FX conversion, no cross-currency totals).
- Refund does not imply cancellation; cancellation (Phase 3) and refund (Phase 4) are independent operations with separate permission requirements and separate transition paths.

---

## 1. What must be added / updated (existing architecture)

### 1.1 Generic capability descriptor and route (`packages/verticals/src/commerce`)
Add `commerce.orders.refund` registration in the capability handler map (`packages/verticals/src/commerce/capabilities.ts`):
- Kind: `command` (`POST /api/capabilities/commerce.orders.refund`).
- Required permission: `commerce:orders_manage` (same manage grant as cancel/fulfill for first release; decide whether a narrower refund-only grant is needed before shipping).
- Input schema (`zod`): `{ orderId: string, expectedRevision: number, amountMinor?: number, reason?: string, currency?: string }` (amount must be validated against the original order snapshot; partial/full limits decided before coding).
- Idempotency: durable `Idempotency-Key` required (`headers["Idempotency-Key"]`); replay must verify current authorization, installation, tenant, and resource ownership before replaying.
- Authorization hook: before replay, confirm the caller has `commerce:orders_manage`, the instance exists in the same org, and the current state allows refund (e.g., `paid` or `fulfilled`; reject `cancelled` or already-refunded orders; reject unpaid orders unless a separate partial-refund policy is approved).

### 1.2 Machine definition (`packages/extensions/src/commerce/machines/cart.json`)
- Add `REFUND_ORDER` event under `paid` (and optionally under `fulfilled` if fulfillment does not prevent refund). Target state: either `refund_pending` (if provider confirmation is required) or `refunded` (if the release uses a direct manual refund without provider confirmation). For the first provider-gated slice, prefer `refund_pending` as an intermediate durable state, then confirm through provider event mapping before moving to `refunded`.
- Keep existing final states (`cancelled`, `fulfilled`) unchanged; `refunded` may also be final or lead to `cancelled` depending on policy. Decision required before coding.

### 1.3 Machine transition records (`packages/server/src/domains/machines/adapters/postgres.ts`)
- Existing atomic `commitTransition` handles the refund event correctly (revision compare-and-swap + INSERT transition). No adapter change needed unless a new `refund_amount` or `refund_reference` context field requires a schema change. If the release requires a new machine-context field (e.g., `refundAmountMinor`, `refundReference`), add it to the JSONB context only; no new table.

### 1.4 Commerce evidence and audit (`packages/verticals/src/commerce/order-projection.ts` and `packages/server/src/domains/evidence`)
- After a confirmed refund transition, append an immutable Evidence record through the generic Evidence port (`CommerceEvidencePort`, used by `capabilities.ts` for order projection). Fields: `actorId`, `reason`, `amountMinor`, `currency` (same as order), `correlationId`, `idempotencyKey`, `recordedAt`, `transitionEvent` (`REFUND_ORDER`).
- Do not create Evidence mutation endpoints or mutable Evidence records. Evidence remains append-only provenance.
- If reconciliation requires tracking a pending provider operation, use a durable operation reference (e.g., `refundOperationId`) stored in the machine context or a separate capability-idempotency result, not in mutable Evidence.

### 1.5 Server capability idempotency (`packages/server/src/domains/capabilities/idempotency.ts`)
- No change to the idempotency store schema or fencing logic; the existing `claim` / `complete` / `fail` / replay mechanism covers refund commands. Confirm that replay verifies authorization/resource-ownership before replay (already required by design; verify in tests).

### 1.6 Commerce extension actions (`packages/extensions/src/commerce/orders-admin-api.ts`, `orders-admin.tsx`, `catalog-schemas.ts`)
- Add `refundCommerceOrder` to `orders-admin-api.ts` (same `POST /api/capabilities/commerce.orders.refund` call with `Idempotency-Key`).
- Add `RefundCommerceOrderInput` type to `orders-admin-api.ts`.
- Extend `orders-admin.tsx` with a refund form/button (visible only for eligible `paid`/`fulfilled` orders), confirmation dialog (`window.confirm`), progress state, and audit display. Add `refundButtonLabel`, `refundConfirmLabel`, `refundReferenceLabel`, `refundAmountLabel`, `refundReasonLabel`, `refundingLabel`, `refundFormCloseLabel` to `catalog-schemas.ts` and pass through `OrdersAdminProps`.
- Do not rely on UI visibility for security; the server must deny unauthorized refund attempts (`403` or `401`).
- Confirm existing pagination/search/filter controls work with the added `refund_pending` or `refunded` status if included in the filter set.

### 1.7 Currency and amount integrity (`packages/verticals/src/commerce/capabilities.ts`, `money.ts`)
- Refund amount (`amountMinor`) must be validated against the original `checkoutSnapshot.totalMinor` or the current order amount. Partial refunds must not exceed the original minor amount; cumulative partial refunds must be tracked (either by summing Evidence refund records or by storing a cumulative `refundMinor` in machine context). Decide tracking mechanism before coding.
- Currency must match the order currency exactly (reject cross-currency refund requests). Use the existing `normalizeCurrency` and `currencyExponent` helpers; do not assume two fraction digits.
- Refund display and confirmation should use the existing `formatMinorAmount` / `formatLineAmount` helpers; no new formatter.

### 1.8 Provider proxy and event mapping (`packages/verticals/src/commerce/capabilities.ts`, `packages/extensions/src/commerce/orders-admin-api.ts`)
- Refund submission uses the existing `ProviderProxy` (`proxyProvider`) through the generic integrations adapter. No direct Stripe SDK calls in Commerce vertical or server machine routes.
- Refund confirmation requires a normalized provider event (`REFUND_CONFIRMED` or equivalent) before the machine transitions from `refund_pending` to `refunded`. Rejected/failed provider events keep the order in `refund_pending` (or revert, depending on policy). Duplicate or out-of-order provider events must not create duplicate transitions or false `refunded` states; use the existing provider-idempotency mechanism (`checkoutOperationKey` pattern, extended to `refundOperationKey`).
- Keep actual public Stripe→Nango→app delivery as a separate production proof gate; do not claim public delivery without deployed-topology evidence.

---

## 2. Verification gates (same behavioral E2E approach as Phase 3)

- **API contract:** `POST /api/capabilities/commerce.orders.refund` uses only the existing generic capability URL (not `/api/refund` or `/api/orders/refund`).
- **Permission:** `commerce:orders_manage` (or approved narrower refund permission) required; anonymous/public-key callers denied (`401`/`403`).
- **Real-Postgres concurrency:** race two distinct command keys with the same expected revision; exactly one refund transition commits. Race same idempotency key concurrently; observe replay (not duplicate). Confirm stale revision conflict (`409`).
- **Pagination:** include `refunded` and `refund_pending` in status filters; confirm cursor pagination remains stable with fixtures.
- **Tenant isolation:** query with wrong `orgId`; confirm no refund evidence leaks.
- **Currency:** refund amount in original currency with correct exponent; reject mismatched currency.
- **Browser:** admin opens eligible `paid` order, submits refund with reason, confirms progress/state/audit; view-only analyst has no refund control; reload confirms persistence; retry with same key confirms replay.
- **No architecture break:** no `packages/server/src/domains/commerce` added; no mutable Evidence mutation endpoint; no Orders-specific route added.

---

## 3. Files that must be updated (existing surface only)

- `packages/verticals/src/commerce/capabilities.ts` — add `commerce.orders.refund` descriptor and handler.
- `packages/extensions/src/commerce/machines/cart.json` — add `REFUND_ORDER` event/state.
- `packages/extensions/src/commerce/orders-admin-api.ts` — add `refundCommerceOrder`, `RefundCommerceOrderInput`, `CommerceOrderStatus` updates.
- `packages/extensions/src/commerce/orders-admin.tsx` — add refund form/button/state display.
- `packages/extensions/src/commerce/orders-admin-api.ts` / `catalog-schemas.ts` — add refund-related labels/schemas.
- `docs/2026-10-04/ORDER-OPERATIONS-E2E-TEST-PLAN.md` / `MANUAL-VERIFICATION-CHECKLIST.md` — add Phase 4 verification entry.
- Optional: `docs/2026-10-08/REFUND-RECONCILIATION-IMPLEMENTATION-PLAN.md` (this file) records the decision.

---

## 4. Non-goals for Phase 4 (not required for this release)

- Refund reconciliation engine, partial/full cumulative limits, or reconciliation dashboard (separate Phase 4.5/5 if approved).
- Customer self-service refund request portal (requires customer identity/scope work from Phase 5).
- Inventory reservation/release tied to refund (requires Phase 5 inventory semantics).
- Refund of unpaid orders (requires separate business-policy decision; current plan assumes refund applies only to confirmed paid orders).
- Refund confirmation before provider event normalization (requires durable provider-idempotency extension; design above includes it, but implementation must verify through sandbox/provider adapter before claiming success).
- Changing the generic Evidence service to allow mutation (remains append-only).
- Adding a new Orders-specific endpoint (`/api/orders/refund`) (remains `POST /api/capabilities/commerce.orders.refund`).
