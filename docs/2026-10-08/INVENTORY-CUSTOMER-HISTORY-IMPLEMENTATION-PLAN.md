# Commerce Inventory and Customer History — Implementation Plan

**Plan date:** 2026-10-08 (America/New_York)
**Status:** Planned (Phase 5 — separate scope gates; blocked on Phase 3 order-state authority and Phase 4 provider confirmation before inventory-sensitive claims)
**Scope:** Atomic inventory reservation/release and server-derived customer history; no marketplace, no subscription, no FX conversion, no full PII retention redesign in this slice.

---

## 1. Architecture constraints (existing architecture — same as Phase 3/4)

- No `packages/server/src/domains/commerce` or new Commerce-specific server domain.
- Reuse existing generic capability route (`POST /api/capabilities/:capability`) for inventory commands and customer queries.
- Keep business meaning in Commerce vertical (`packages/verticals/src/commerce`); persistence uses existing generic machine storage adapter (`packages/server/src/domains/machines/adapters/postgres.ts`) with revision/CAS.
- No mutable Evidence mutation endpoints; Evidence remains append-only provenance for inventory reservations/release and customer history events.
- Provider/integrations work stays behind `packages/extensions/src/commerce/orders-admin-api.ts` / generic `ProviderProxy`; no direct Stripe SDK or embedded secrets in Commerce handlers.
- Currency/minor-unit arithmetic must be exponent-aware; inventory amounts use integer minor units in the same currency as the associated order/cart.
- Customer history must derive actor from server-derived authenticated context (`context.actorId` from `orgMiddleware`), never from caller-supplied email/ID.

---

## 2. What must be added / updated

### 2.1 Inventory reservation (machine/transition authority)

- **Machine definition (`packages/extensions/src/commerce/machines/cart.json`):**
  - Add inventory-related events/states if reservation is tracked as a durable machine transition. If inventory is tracked separately from the cart machine, use a new generic machine (`inventory_reservation` or `inventory_item`) with its own `start`/`reserve`/`release`/`expire` events. Decision required before coding.
  - If inventory uses the existing cart machine, add `RESERVE_ITEM` event under `checkout_pending` or a new `inventory_pending` state; add `RELEASE_ITEM` event under `awaiting_payment` (release on failed/abandoned checkout) and `paid` (decrement on settled payment). Keep `cancelled` and `refunded` states to include inventory-restock transitions.
  - Final states for inventory: `reserved` (temporary), `released` (temporary after failure/cancel/refund before restock), `decremented` (confirmed after settled payment). Decision: is inventory a separate durable aggregate or part of the cart machine context? The current flat machine-state limitation (noted in Phase 3 ADR) means a separate inventory machine avoids overloading the cart machine with inventory semantics; recommend a separate `inventory_item` machine or a dedicated reservation instance.

- **Server storage (`packages/server/src/domains/machines/adapters/postgres.ts`):**
  - If inventory uses a new machine definition, add it through existing `saveDefinition` / `start` / `commitTransition`. No adapter change needed.
  - If inventory uses additional context fields (`inventoryItemId`, `quantityReserved`, `quantityDecremented`), add them as JSONB context fields only; no new column.
  - Add tenant-scoped index on inventory machine instances (`orgId`, `machineName`, `currentState`, `createdAt`) if not already covered by existing `machine_instances_org_name_state_created_idx`.

- **Generic capability descriptor (`packages/verticals/src/commerce/capabilities.ts`):**
  - Add `commerce.inventory.reserve` (command) and `commerce.inventory.release` (command) or equivalent inventory operations. Required permission: new `commerce:inventory_reserve` or reuse `commerce:orders_manage` with resource-level authorization (decision required).
  - Input schema: `{ itemId: string, quantity: number, orderId?: string, reservationReference?: string }` for reserve; `{ reservationId: string, reason?: string }` for release/release-on-cancel.
  - Idempotency: same durable `Idempotency-Key` fencing; replay verifies authorization before replay.

- **Commerce vertical (`packages/verticals/src/commerce`):**
  - Add inventory rules, reservation validation, and concurrency checks (two concurrent checkout commands competing for the last unit must result in exactly one reservation). This requires atomic conditional updates or equivalent transactional locks (`compare-and-swap` on `quantityReserved` / `quantityAvailable`).
  - Confirm that the current machine `revision` + `compare-and-swap` is sufficient for inventory reservation (it is for state transitions, but may not be sufficient for inventory quantity updates that span multiple instances). If inventory quantity updates require a separate transactional lock, document the ADR and do not claim inventory correctness without it.

### 2.2 Customer history query

- **Generic capability descriptor (`packages/verticals/src/commerce/capabilities.ts`):**
  - Add `commerce.orders.mine` (query). Required permission: authenticated customer identity (derived from `context.actorId`; never from request DTO). No public-key access.
  - Input: `{ cursor?, limit?, status?: ... }`. Return same `CommerceOrderSummary` format.
  - Authorization: server derives actor from `getUserId(c)` / JWT identity; filter instances by `context.ownerUserId` (or `guest` flag for narrow expiring guest grants). Never accept `customerId` or `email` as authority in the request body.

- **Machine instance context (`packages/extensions/src/commerce/cart.ts`, `packages/extensions/src/commerce/orders-admin-api.ts`):**
  - Confirm `ownerUserId` is set correctly at claim (`claim` transition stamps `ownerUserId`). If not, add it to the `claim` transition params or ensure it exists in the instance context.
  - Confirm `guest` flag is set correctly for anonymous cart instances and cleared on claim.

- **Extension UI (`packages/extensions/src/commerce/orders-admin.tsx`, `orders-admin-api.ts`):**
  - Add customer-history surface (optional for Phase 5; can be deferred). If included: add `/admin/orders/customer` or similar admin route; confirm `ADMIN_ROUTE_ACCESS` mapping (`packages/client/src/auth/admin-routes.ts`). Given the user asked for no extra framework changes, confirm that `orders` admin route (`packages/client/src/auth/admin-routes.ts`) can host the customer-history query without a new route; if a new route is needed, add it to `admin-routes.ts` with `sessionHasPermission(s, PERMISSIONS.COMMERCE_ORDERS_VIEW)`.

### 2.3 Evidence and audit for inventory and refund

- **Evidence projection (`packages/verticals/src/commerce/order-projection.ts`):**
  - Confirm existing Evidence projection supports inventory events (`inventory_reserved`, `inventory_decremented`, `inventory_released`, `inventory_oversell_denied`) and refund events (`refund_submitted`, `refund_confirmed`, `refund_failed`). If not, extend the projection mapping; keep projection idempotent and recoverable from transition replay.

- **Audit/transition records (`packages/server/src/domains/machines/adapters/postgres.ts`, `packages/verticals/src/commerce/capabilities.ts`):**
  - Confirm transition params include inventory/reference data where relevant (e.g., `reservationReference`, `quantity`). Confirm `machine_transitions` table records include `success: true/false`; verify through DB query.

---

## 3. Verification gates (same E2E approach)

- **Real-Postgres concurrency (inventory):** two concurrent checkout commands with different capability keys for one active cart; exactly one `inventory_reserved` transition commits; the second fails with `409` or appropriate business rejection (not a silent oversell). Confirm through DB transition count.
- **Pagination/stable cursor:** include `refunded` and `refund_pending` in status filters; confirm cursor pagination stable.
- **Tenant isolation:** inventory records and refund evidence filtered by `orgId`; cross-tenant queries return empty.
- **Browser/admin:** admin opens eligible paid order, submits refund (with optional amount/reason), confirms progress/state/audit; reload confirms persistence; retry with same idempotency key confirms replay.
- **No new Orders endpoint:** `POST /api/capabilities/commerce.orders.refund` and any inventory commands use the same generic URL.
- **No mutable Evidence mutation endpoint:** Evidence remains append-only.

---

## 4. Non-goals for Phase 5

- Full inventory reconciliation dashboard, automated restock scheduling, or supplier integration (separate scope gate if approved later).
- Customer self-service history with public-key access or email-as-authentication.
- Refund reconciliation engine, partial/full cumulative limits, or reconciliation dashboard (separate Phase 4 verification gate).
- Changing generic Evidence service to allow mutation (remains append-only).
- Adding new platform UI framework; reuse existing Commerce extension (`packages/extensions/src/commerce/orders-admin.tsx`).

---

## 5. Acceptance criteria

- `commerce.orders.refund` registered on existing generic capability route; server denies unauthorized, cross-tenant, invalid-state, stale, or duplicate requests (`401`/`403`/`404`/`409`).
- Refund transition (`REFUND_ORDER`) commits atomically with revision/CAS; transition record and Evidence projection are durable and replay-safe.
- Inventory reservation/release uses atomic conditional updates or equivalent transactional lock (verify through real-Postgres concurrency test); no oversell under concurrent checkout.
- Customer query (`commerce.orders.mine`) uses server-derived actor scope; never accepts arbitrary `customerId` or `email` as authority.
- Browser/admin confirms refund form/button visible for eligible orders; audit/evidence reflects actor/reason/amount; reload confirms persistence; retry confirms replay.
- No `packages/server/src/domains/commerce` added; no mutable Evidence mutation endpoint; no Orders-specific route.
