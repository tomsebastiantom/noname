# Decision — Generic Checkout and Payment Boundary

> **Date:** 2026-09-09
> **Status:** Binding implementation plan
> **Scope:** Checkout initiation, provider callbacks, orders, and XState

## Decision

Checkout is an **extension-owned effect**, not a generic server commerce domain. The platform supplies generic machine execution, tenant-scoped integrations, Nango proxy access, durable provider-event processing, and storage ports. The commerce extension supplies the checkout mapping and uses those contracts.

No Stripe SDK, Stripe key, Stripe webhook parser, order table, or payment-specific branch belongs in `domains/machines`, `domains/webhooks`, or the generic integrations transport.

## Generic flow

```text
Browser
  → machine/cart/:id/checkout
  → extension checkout effect
  → integrations.proxyProvider(providerConfigKey, connection)
  → provider hosted checkout URL
  → browser redirect

Provider callback
  → Nango
  → integrations Nango ingress
  → durable provider-events queue
  → provider mapping registry
  → normalized PAYMENT_SUCCEEDED / PAYMENT_FAILED
  → MachineEngine.transition()
  → ephemeral XState actor
  → persisted cart/order projection + audit
```

The machine engine never knows that an event came from Stripe. A different provider maps its native event to the same normalized event.

## Contracts

### Checkout request

The extension effect receives only validated cart context and returns a provider-independent result:

```ts
type CheckoutRequest = {
  orgId: string;
  machineInstanceId: string;
  providerConfigKey: string;
  amount: number;
  currency: string;
  successEvent: string;
  failureEvent: string;
  metadata: Record<string, string>;
};

type CheckoutResult = {
  provider: string;
  externalCheckoutId: string;
  redirectUrl: string;
};
```

`metadata` must include a machine correlation ID and a safe order/cart reference. It must not include credentials or sensitive payment data.

### Provider mapping

Mappings are registered by `(providerConfigKey, providerEventType)` and return:

```ts
type NormalizedPaymentEvent = {
  event: "PAYMENT_SUCCEEDED" | "PAYMENT_FAILED";
  machineInstanceId: string;
  params: {
    paymentRef?: string;
    amount?: number;
    currency?: string;
    reason?: string;
  };
};
```

Mappings extract only safe fields. Unknown events, missing correlation, and malformed payloads are observable and never guess a machine instance.

## XState machine contract

The cart machine remains JSON:

```json
{
  "name": "cart",
  "initial": "active",
  "states": {
    "active": {
      "on": {
        "checkout_started": { "target": "awaiting_payment" }
      }
    },
    "awaiting_payment": {
      "on": {
        "PAYMENT_SUCCEEDED": { "target": "paid" },
        "PAYMENT_FAILED": { "target": "payment_failed" }
      }
    },
    "paid": { "final": true },
    "payment_failed": { "final": true }
  }
}
```

The checkout request must first transition the machine to `awaiting_payment` only after a checkout session is successfully created. The callback later sends exactly one normalized payment event. Duplicate callbacks are rejected by the durable provider-event job ID and machine concurrency boundary.

## Order boundary

The first implementation should not add a generic `orders` table to the platform. The commerce extension may store an order projection through its own backend/effect boundary. The machine context can temporarily retain provider-independent references for the flat-state proof:

```json
{
  "cartId": "...",
  "checkoutId": "...",
  "paymentRef": "...",
  "orderRef": "..."
}
```

When order durability, inventory locking, refunds, or admin queries exceed machine context, add an extension-owned relational storage port and adapter. The generic machine engine remains unchanged.

## Security

- Merchant credentials remain in Nango.
- Browser receives only the hosted checkout URL and public identifiers.
- Never accept amount, currency, or order ownership solely from the browser; derive them from the persisted cart/context or extension backend.
- Nango connection attribution resolves the organization; provider payload organization claims are not trusted.
- Provider callbacks are idempotent by connection plus provider event/delivery ID.

## Implementation order

1. Add a generic checkout-effect port in the extension/backend boundary.
2. Implement the commerce checkout effect using `IntegrationsService.proxyProvider`.
3. Add `awaiting_payment`, `paid`, and `payment_failed` to the commerce machine fixture.
4. Send `checkout_started` only after proxy success, with checkout ID and correlation metadata.
5. Register provider mappings in the commerce extension, not in generic integrations transport.
6. Route normalized callback events through the durable provider-event worker to `MachineEngine.transition()`.
7. Add extension-owned order projection only when the checkout proof requires it.
8. Test with Stripe sandbox through Nango, then repeat the same machine test with a second provider mapping fixture.

## Non-goals

- No direct Stripe API calls from platform domains.
- No provider-specific routes.
- No provider-specific code in `webhooks`.
- No generic commerce domain under `packages/server/src/domains/commerce/`.
- No speculative snapshot column; current flat state/context remains sufficient.
