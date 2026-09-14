---
title: Verify a checkout
sidebar_position: 3
status: current
owner: commerce
last_verified: 2026-09-14
audience: [developer, qa]
---

# Verify a checkout

> **How-to guide** · Exercise the reliability path without treating a plan as proof.

## Prerequisites

- Local stack running
- Full demo seed completed
- Storefront available
- Stripe Sandbox/Nango configuration available for the environment

## Flow to verify

```text
cart
  → trusted server pricing
  → durable capability idempotency
  → provider checkout
  → awaiting_payment
  → signed callback ingress
  → provider receipt
  → worker event processing
  → XState transition
  → paid
  → order/payment Evidence projection
```

## Verify the user path

1. Add the seeded product to the cart.
2. Start checkout.
3. Complete the Sandbox payment.
4. Deliver the signed callback through the configured boundary.
5. Confirm the machine reaches `paid`.
6. Open `/admin/orders` and confirm the read-only order projection.

## Reliability checks

Confirm that:

- Replaying the same capability request returns the stored result.
- A conflicting idempotency key is rejected.
- Duplicate provider events do not create duplicate effects.
- Reloading the persisted machine continues from its saved state.
- Payment success creates immutable order/payment Evidence and typed links.

## Current limitation

The current verification covers the signed application callback path. A real public Stripe webhook delivery remains a separate external deployment check.

## Evidence

See the dated live verification record in the repository:

```text
docs/2026-09-12/CHECKOUT-RELIABILITY-LIVE-VERIFICATION.md
```
