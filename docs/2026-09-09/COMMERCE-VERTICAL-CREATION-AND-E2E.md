# Commerce Vertical Package — Creation and End-to-End Test

## Package layout

Trusted vertical implementations live in the shared `@noname/verticals` workspace package. The server owns only generic infrastructure and injects platform ports into the vertical.

```text
packages/verticals/
└── src/
    └── commerce/
        ├── capabilities.ts
        ├── types.ts
        └── index.ts

packages/server/src/domains/capabilities/
├── registry.ts
├── routes.ts
└── index.ts
```

`domains/capabilities` is platform infrastructure. `@noname/verticals/commerce` is vertical business code. The commerce package cannot access the database, secrets, or Nango directly; it receives narrow ports from bootstrap.

## Adding another vertical

1. Add `src/<vertical>/` to `packages/verticals`.
2. Define schemas and capability handlers there.
3. Depend on narrow platform contracts, not server implementation modules.
4. Export the vertical from its index.
5. Register its handlers in `createCapabilityRegistry()` during server bootstrap.
6. Add machine definitions and provider-event mappings as data/configuration owned by that vertical.
7. Add unit tests using fake ports before wiring production services.

The generic capability route and machine routes do not change.

## Current checkout contract

```text
POST /api/capabilities/commerce.checkout
Headers:
  Idempotency-Key: unique-attempt-id
Body:
  { "input": { "instanceId", "integrationId", ... } }
```

The handler must load the cart, verify its state and organization, derive totals from trusted catalog/cart data, call `IntegrationsService.proxyProvider()` through Nango, and return a hosted URL. It must not mark payment successful. A later Nango callback enters the durable provider-event queue and transitions the machine with `PAYMENT_SUCCEEDED` or `PAYMENT_FAILED`.

The current checkout handler is a contract scaffold only: it still expects the trusted amount/catalog port and provider checkout-session contract to be finalized before enabling the live capability. Do not expose it to production traffic until those validations and idempotency storage are complete.

## End-to-end test plan

1. Start Podman services, API, and workers.
2. Provision Nango and connect a merchant sandbox account.
3. Seed an organization, publishable key, cart machine, and catalog.
4. Start a cart through the scoped machine route.
5. Add catalog items through the cart machine.
6. Call `commerce.checkout` with an idempotency key; the server derives the total and calls Nango.
7. Assert a hosted checkout URL and `awaiting_payment` machine state.
8. Complete the provider sandbox payment.
9. Assert Nango forwards the callback to integrations.
10. Assert the provider-event BullMQ job maps to `PAYMENT_SUCCEEDED`.
11. Assert the machine transitions once to `paid`, persists context, and records a transition history row.
12. Replay the same callback and assert no second transition.
13. Reload the instance and assert the persisted state/context remain correct.

## Security and scale checks

- No browser-provided amount is trusted.
- No provider secret reaches the browser, vertical package, or machine context.
- Capability requests require organization auth and an idempotency key.
- Provider callbacks use deterministic queue job IDs.
- HTTP replicas remain stateless; Postgres and Redis provide shared coordination.
- Each vertical adds code only to `@noname/verticals`; generic platform routes and workers remain unchanged.
