# Decision — Generic Extension Capability Runtime

> **Date:** 2026-09-09
> **Status:** Binding architecture

## Purpose

The platform needs a request/response boundary for vertical operations such as checkout, reservation, subscription creation, and publishing. A checkout-only route or callback in `MachineRouteDeps` does not scale across domains.

The chosen abstraction is a **capability runtime** under `packages/server/src/domains/capabilities`. A capability is a named, authenticated, idempotent request/response operation owned by a vertical module and exposed through one generic platform route. It is a normal shared platform domain, not a special top-level subsystem.

## Contract

```text
POST /api/capabilities/:capability
  → authenticate and resolve org
  → verify installed capability
  → validate bounded input
  → execute registered handler
  → return typed result
```

The route is generic. The capability name is data, not a hard-coded commerce branch:

```text
commerce.checkout
booking.reserve
membership.subscribe
content.publish
```

The browser never calls Nango. A handler may use `IntegrationsService.proxyProvider`, but credentials and tenant connection resolution remain server-side.

## Handler contract

```ts
export type CapabilityContext = {
  orgId: string;
  actorId?: string;
  requestId: string;
  idempotencyKey: string;
};

export type CapabilityHandler = (
  input: unknown,
  context: CapabilityContext,
) => Promise<unknown>;
```

A registry is created at bootstrap and receives handlers from vertical modules. The generic runtime owns:

- route and request-size limits;
- authentication and organization isolation;
- installation/capability checks;
- idempotency-key requirements and bounded retention;
- timeout and error normalization;
- request tracing and audit metadata.

Handlers own validation of vertical input, business rules, provider calls through ports, and result mapping. They must not mutate machine state by choosing a target; they call `MachineEngine.transition()` with a declared event when appropriate.

## Commerce example

```text
POST /api/capabilities/commerce.checkout
  input: { cartInstanceId }

commerce.checkout handler:
  1. Load the cart through MachineEngine.
  2. Verify organization, ownership/public grant, and cart state.
  3. Derive amount and currency from trusted persisted context/catalog data.
  4. Build provider-neutral metadata with the machine instance ID.
  5. Call IntegrationsService.proxyProvider() through the merchant's Nango connection.
  6. Transition the cart to awaiting_payment only after provider success.
  7. Return { redirectUrl, externalCheckoutId }.
```

The same route/runtime also serves non-commerce capabilities without changing machine routes or adding vertical callbacks.

## Reliability

- The client supplies an idempotency key; the runtime returns the stored result for a completed duplicate request.
- The handler passes a provider idempotency key derived from the capability key and instance ID.
- Short synchronous operations may complete in the request. Long-running operations enqueue a durable job and return an operation ID; they must not hold the request open.
- Provider callbacks use the separate Nango ingress and `{provider-events}` queue, then call the machine engine once.
- The event bus is notification fan-out only, never the sole source of business execution.

## Security

- Generic capability routes require an installed extension/capability and explicit permission or public grant.
- Public capabilities must be explicitly allowlisted by path/capability and re-verified server-side with `requirePublicActor`; the publishable key grants only the explicitly designed public capability and is not authentication for account-sensitive operations.
- The edge `PUBLIC_ROUTES` list controls JWT bypass only; it never grants access by itself. The origin must still verify the publishable key against the edge-resolved organization.
- Capability handlers cannot receive provider secrets. Nango connection IDs are resolved from tenant settings.
- Inputs and outputs are schema-bounded; raw provider payloads never cross to the browser.

## Why this is preferable

Medusa modules and Vendure plugins demonstrate that vertical capabilities should be packaged as independently registered units with services and API surfaces. Temporal demonstrates that external operations should be small, idempotent activities with explicit retry boundaries. This runtime adopts those principles without introducing a second workflow engine or requiring a separate service per vertical.

The current extension dispatcher remains useful for asynchronous provider-event delivery. It is not reused for synchronous capability responses because delivery is fire-and-forget. Both paths share capability registration, installation checks, authentication, and typed contracts.

## Implementation status

- The generic capability registry and route now exist at `packages/server/src/capabilities/`.
- The route requires `STOREFRONT_VIEW` authorization and an `Idempotency-Key`.
- No commerce handler is registered yet; the empty registry is intentional until checkout input, product pricing, and provider-session contracts are finalized.
- The temporary commerce client checkout implementation was removed; it must not call a guessed endpoint.

## Remaining implementation order

1. Add durable idempotency storage with request hashing and bounded retention.
2. Define the generic capability registration/bootstrap contract for trusted first-party domain modules.
3. Register commerce checkout as the first handler only after its trusted pricing/catalog port is available.
4. Move the commerce client action to `/api/capabilities/commerce.checkout`.
5. Add Nango checkout proxy and `awaiting_payment` transition.
6. Add Stripe and provider-neutral callback mapping tests.
7. Add a second non-commerce fixture capability to prove the runtime is not commerce-coupled.
