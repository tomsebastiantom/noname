# Decision — Generic Machine Routes vs. Vertical Checkout

> **Date:** 2026-09-09
> **Status:** Binding architecture correction

## Decision

`MachineRouteDeps` and generic machine routes must expose only machine infrastructure. They must not accept `createCheckout`, payment handlers, order services, inventory services, or any other vertical callback.

This platform supports many domains and extensions. Adding a checkout callback to machine routes would make the generic machines domain depend on commerce and would force every future vertical to add another special callback.

## Correct boundary

```text
Generic machine API
  → MachineEngine only
  → load/start/transition/persist/audit

Commerce extension/backend
  → owns checkout route/effect
  → validates cart and amount from persisted context
  → calls IntegrationsService.proxyProvider
  → returns hosted checkout URL
  → emits machine event only after provider request succeeds

Nango
  → provider auth, credentials, retries, provider callbacks

Provider-event worker
  → maps callback to normalized event
  → calls MachineEngine.transition once
```

## Why this scales

- The machine engine remains reusable for commerce, booking, membership, SaaS, content, and custom workflows.
- Provider-specific and vertical-specific behavior stays in extension packages or isolated backend modules.
- New domains add their own routes and ports instead of modifying `MachineRouteDeps`.
- Nango remains the single external-provider boundary.
- XState remains the only transition authority.

## Rejected design

```ts
interface MachineRouteDeps {
  engine: MachineEngine;
  createCheckout: (input: CheckoutInput) => Promise<CheckoutResult>;
}
```

This is rejected because `createCheckout` is commerce-specific and turns a generic machine route into a vertical orchestration layer.

## Accepted implementation

The generic machine route remains:

```ts
interface MachineRouteDeps {
  engine: MachineEngine;
  tenantSettings: Pick<TenantSettingsService, "get">;
}
```

Checkout is exposed by the commerce extension/backend contract, not by `/api/machines` generic dependencies. The cart machine can still receive `checkout_started`, `PAYMENT_SUCCEEDED`, and `PAYMENT_FAILED`; it does not know who performed the external call.

## References

- [`DECISION-GENERIC-CHECKOUT-PAYMENTS.md`](./DECISION-GENERIC-CHECKOUT-PAYMENTS.md)
- [`XSTATE-REUSE-MIGRATION-PLAN.md`](../2026-09-08/XSTATE-REUSE-MIGRATION-PLAN.md)
- [`EXTERNAL-PROVIDERS-VIA-NANGO.md`](../2026-09-07/EXTERNAL-PROVIDERS-VIA-NANGO.md)
