# Commerce Hardening Implementation Tracker

> Status: In progress
> Started: 2026-09-09
> Scope: implement and verify the checkout hardening sequence one workstream at a time.

## Workstreams

- [x] 1. Trusted server-side pricing
- [ ] 2. Persistent checkout idempotency
- [ ] 3. Standard checkout events: `checkout_started` → `awaiting_payment` → `paid` / `payment_failed`
- [ ] 4. Durable Nango provider-event receipts, deduplication, replay/failure handling, and real Stripe payload parsing
- [ ] 5. Automated guest/authenticated checkout E2E, callback, reload, duplicate callback, and final `paid` assertion
- [ ] 6. Generic vertical contribution registry replacing hardcoded commerce bootstrap wiring
- [ ] 7. Order projection/admin UI
- [ ] 8. Second-provider fixture

## Current baseline

- Guest cart access uses a tenant publishable key and authenticated carts use JWT.
- Stripe Checkout sessions can be created through Nango and redirect to Stripe test Checkout.
- The browser success URL is not payment confirmation; the server callback must transition the cart.
- Browser cart mutations no longer send or persist a price. Checkout now looks up published product prices through the server content port.
- Checkout idempotency headers are required but results are not persisted.
- Provider callbacks are queued but durable receipts and exactly-once processing are incomplete.
- The current browser checkout flow has been manually exercised, but the complete callback-to-`paid` E2E is not automated.

## Verification policy

Each workstream must have:

1. A focused implementation change.
2. Unit/integration tests where applicable.
3. Package typecheck and lint.
4. Browser or E2E verification when the workstream affects runtime behavior.
5. This document updated with status, evidence, and remaining caveats before starting the next workstream.

## Status log

### 2026-09-09 — tracker created

- Reviewed `COMMERCE-VERTICAL-CREATION-AND-E2E.md`, `DECISION-GENERIC-CHECKOUT-PAYMENTS.md`, `NANGO-FORWARDED-WEBHOOKS-XSTATE.md`, and `SESSION-STATUS.md`.
- Confirmed the first blocker is browser-authoritative pricing.

### 2026-09-09 — Workstream 1 complete

- Removed browser price authority from `packages/extensions/src/commerce/cart.ts` and the ProductCard call path.
- Added a narrow catalog port to the commerce capability contribution.
- Checkout derives amount from published `product` content prices on the server and rejects carts whose catalog prices cannot be resolved.
- Browser cart display falls back to persisted cart total when item-level prices are absent.
- Verified: verticals, server, and extensions typecheck/lint pass.
- Caveat: cart item display totals are still a UI projection; checkout uses server catalog prices as authority.
- Next: persistent checkout idempotency.
