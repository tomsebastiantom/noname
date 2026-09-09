# Nango-Forwarded Webhooks and XState

> **Date:** 2026-09-09
> **Status:** Binding architecture for provider callbacks
> **Read first:** [`EXTERNAL-PROVIDERS-VIA-NANGO.md`](../2026-09-07/EXTERNAL-PROVIDERS-VIA-NANGO.md) · [`MACHINE-INVOKE-EFFECTS.md`](../2026-09-07/MACHINE-INVOKE-EFFECTS.md) · [`XSTATE-REUSE-MIGRATION-PLAN.md`](./XSTATE-REUSE-MIGRATION-PLAN.md)

## Rule in one line

External providers never call provider-specific machine routes. Nango receives or manages the provider integration and forwards callbacks to the integrations domain. The integrations domain verifies Nango, resolves the tenant connection, maps the provider event through a registered mapping, and publishes a normalized event for XState consumers. The separate webhooks domain is not involved in Nango ingress.

## End-to-end flow

```text
Stripe / Shopify / QuickBooks / any Nango provider
                         |
                         v
                  Nango webhook handling
           verification, provider attribution, retry
                         |
                         v
             POST /api/integrations/nango/incoming
                         |
                         v
        integrations: verify + resolve connectionId
                         |
                         v
        provider mapping registry (configuration/code)
                         |
                         v
               normalized machine event


                         |
                         v
             receipt insert and idempotency check
                         |
                         v
                    BullMQ worker
                         |
                         v
                 internal event bus
                         |
                         v
         ephemeral XState actor, one event only
                         |
                         v
       persist currentState/context and audit result
```

The route is Nango-specific because it authenticates the Nango boundary, not because it contains Stripe or another provider's business logic. It must not become `/inbound/stripe`, `/inbound/shopify`, or one route per provider.

## Responsibilities

| Component | Responsibility | Must not do |
|---|---|---|
| Nango | Provider authentication, connection attribution, provider delivery/retry behavior, provider payload forwarding | Choose a machine state or execute platform transitions |
| Integrations ingress | Verify the Nango signature, parse the Nango envelope, resolve `connectionId`, and publish an attributed provider event | Call provider APIs or contain commerce logic |
| Provider mapping registry | Map `(provider, eventType)` to a normalized event and extract safe correlation data | Select the next XState state or contain secrets |
| Event consumer/worker | Apply mapping, persist processing status, and publish a normalized event | Run provider SDKs or bypass the machine engine |
| Webhooks domain | Manage platform-owned webhook subscriptions, receipts, and outbound delivery only | Receive Nango callbacks or provider webhooks |
| Machine engine | Reconstruct an ephemeral actor, send exactly one normalized event, persist the XState result | Verify webhooks, call Nango, or calculate a target state manually |
| XState definition | Declare states, accepted events, guards, and transitions as JSON | Contain provider credentials, URLs, signatures, or raw provider payload assumptions |

## Nango envelope

The ingress contract is provider-independent. Nango's exact wire shape is an adapter concern, but the platform must obtain these fields before mapping:

```ts
type NangoWebhookEnvelope = {
  deliveryId: string;
  connectionId: string;
  providerConfigKey: string;
  providerEventId: string;
  providerEventType: string;
  payload: Record<string, unknown>;
  occurredAt?: string;
};
```

`deliveryId` and `providerEventId` are retained for tracing and idempotency. `connectionId` is the primary tenant attribution key. The platform must not trust an organization identifier copied from an arbitrary provider payload when a connection lookup is available.

## Provider mapping registry

The registry is the only place that understands provider event names and payload shapes. It is not a registry of actors and it does not execute transitions.

```ts
type NormalizedExternalEvent = {
  event: string;
  params: Record<string, unknown>;
  correlation: {
    machineInstanceId?: string;
    orderRef?: string;
    paymentRef?: string;
  };
};

type ProviderEventMapping = {
  providerConfigKey: string;
  providerEventType: string;
  normalize: (payload: Record<string, unknown>) => NormalizedExternalEvent | null;
};
```

Mappings should be registered by stable provider configuration key and event type. They may extract a machine instance ID from metadata, an order reference from a provider object, or a payment reference from a provider response. If a mapping cannot safely correlate the event to an instance, it returns `null`; the receipt remains auditable and no machine transition occurs.

A mapping may produce common platform events such as `PAYMENT_SUCCEEDED`, `PAYMENT_FAILED`, `REFUND_SUCCEEDED`, or `FULFILLMENT_UPDATED`. XState sees the common event and parameters, not Stripe's `checkout.session.completed` or another provider's equivalent.

## Example: asynchronous payment

A cart machine stores:

```json
{
  "id": "cart-payment",
  "initial": "awaiting_payment",
  "states": {
    "awaiting_payment": {
      "on": {
        "PAYMENT_SUCCEEDED": { "target": "paid" },
        "PAYMENT_FAILED": { "target": "payment_failed" }
      }
    },
    "paid": { "type": "final" },
    "payment_failed": { "type": "final" }
  }
}
```

The checkout effect calls Nango through the integrations port and stores a provider-independent payment reference plus the Nango `connectionId` in machine context. The external provider later emits its own event. Nango forwards it with the connection attribution. The mapping registry converts, for example:

```text
Stripe checkout.session.completed
  -> PAYMENT_SUCCEEDED
  -> { paymentRef, machineInstanceId }

Provider B payment.confirmed
  -> PAYMENT_SUCCEEDED
  -> { paymentRef, machineInstanceId }
```

The webhook worker then calls the machine port once with `PAYMENT_SUCCEEDED`. The XState actor decides whether the event is valid from the persisted state. The engine persists the actor snapshot projection and publishes the existing transition event. A duplicate provider delivery is stopped by the webhook receipt uniqueness constraint before it reaches XState.

## Ordering and failure behavior

1. Verify the Nango forwarding signature before parsing or enqueueing.
2. Resolve `connectionId` to the organization and reject unknown or disabled connections.
3. Persist the raw normalized receipt before queueing. Store the provider key, event ID, delivery ID, and payload needed for replay/audit.
4. Deduplicate by provider connection plus provider event ID. Nango retries must not create multiple machine transitions.
5. Enqueue processing and return a success response only after durable receipt/queue handling succeeds.
6. Map the event in the worker. Unknown provider event types are recorded as unhandled; they do not guess a machine event.
7. Correlate the normalized event to an instance and send exactly one event to the machine engine.
8. If the machine rejects the event, preserve the existing validation/rejection audit behavior. Do not retry the same business event indefinitely.
9. If infrastructure fails before processing completes, retry the webhook job using the receipt ID; idempotency makes retries safe.
10. Mark the receipt processed, failed, or unhandled with an operator-visible reason.

Concurrent callbacks for the same instance require the machine engine's existing transaction/row-lock or optimistic concurrency boundary. Webhook deduplication alone does not guarantee ordering between different events.

## Security and data boundaries

- The ingress verifies Nango, not every provider signature. Provider-specific signature verification belongs to Nango.
- Merchant OAuth credentials and provider secrets remain in Nango or the secrets domain; they never enter machine context.
- Raw provider payloads are retained only under the webhook receipt retention policy and are not passed wholesale into XState unless a mapping explicitly selects safe fields.
- Mapping output is validated before enqueueing and must be bounded in size.
- The connection-to-organization lookup is authoritative; payload organization fields are hints only.
- Every transition records the receipt ID, connection ID, provider key, provider event ID, and normalized event for audit correlation.

## Implementation boundary

The integrations domain owns Nango ingress. The webhooks domain remains independent and continues to provide platform-owned outbound webhook subscriptions and delivery infrastructure. Do not add Nango adapters, provider signatures, or provider mappings to `domains/webhooks`.

The implementation should:

1. Keep `POST /api/integrations/nango/incoming` as the sole forwarded-provider ingress.
2. Verify the Nango forwarding signature through the integrations Nango port.
3. Resolve `connectionId` through the integrations/tenant-settings port.
4. Add a mapping registry keyed by provider configuration key and provider event type in the integrations-side consumer or extension backend.
5. Emit attributed provider events through the integrations event contract; mapping failures must be observable, not silently dropped.
6. Keep `MachineEngine.transition()` as the only machine execution boundary.
7. Add tests for signature rejection, connection attribution, unknown mapping, mapping correlation, normalized payment success, and one-transition-only behavior.
8. Update the XState migration smoke test to cover a normalized provider event after an instance reload.

No provider-specific route, provider SDK, direct provider REST call, or provider secret may be added to the generic machine engine or webhooks domain.

## Compatibility with the XState migration

This architecture does not invalidate [`XSTATE-REUSE-MIGRATION-PLAN.md`](./XSTATE-REUSE-MIGRATION-PLAN.md). It clarifies the event source that enters the engine:

- XState remains the sole transition authority.
- Actors remain ephemeral per request/job.
- `currentState` plus `context` remains sufficient for the current flat-state machines.
- Integrations handling ends at an attributed provider event; a separate mapping consumer emits the normalized machine event and does not calculate a target state.
- The webhooks domain remains unrelated to Nango ingress and handles platform-owned webhook subscriptions/delivery only.
- Invoke/effect work remains separate: an outbound Nango request may later produce an asynchronous callback, but the callback is processed as a new normalized event.

The XState migration should be implemented with a synthetic normalized event first. Nango ingress and provider mappings can then be integrated without changing the machine engine contract.
