# Roadmap Next-Step Evaluation

Date: 2026-09-14

## Executive decision

The immediate next roadmap step should be:

> **Finish Checkout Reliability Workstream 1: perform the live XState cart reload smoke and close its sign-off.**

This is not another seed, fixture, or Orders UI task. The recent work completed the reusable Evidence read path, Commerce order projection, Orders admin read view, seed profiles, and shared fixtures. The remaining highest-value foundation gap is proving the machine engine against the live cart workflow before declaring checkout reliable.

The complete ordered path is:

```text
1. Workstream 1 sign-off
   live XState cart start → transition → reload → transition

2. Workstream 2 live verification
   Postgres capability idempotency schema + concurrent replay/conflict proof

3. Workstream 3 live verification
   Nango ingress → durable receipt → BullMQ → worker → machine transition

4. Workstream 4 end-to-end checkout proof
   guest/auth cart → checkout → callback → paid → replay safety

5. Commerce server-domain expansion
   products/catalog → persistent cart → checkout → orders/inventory

6. Commerce storefront completion
   ProductGrid/ProductInfo/AddToCart/CartDrawer/CheckoutButton/etc.
```

## What is complete since the older roadmap snapshots?

The older `2026-08-21/CURRENT_STATUS.md` is no longer fully authoritative. It describes Commerce as a skeleton and the Orders/Evidence work as absent, but the current repository now contains:

- Evidence/Provenance Kernel in the server domain
- Generic Evidence read endpoints
- Commerce payment-success order projection
- Immutable order/payment Evidence records and typed links
- Commerce-owned Orders admin extension UI
- Platform-owned generic admin shell only
- `packages/seeding` profile CLI and dependency-aware runner
- `packages/fixtures` for shared pure fixture values
- Live deterministic Commerce order seeding
- Full repository test and build verification

The older status is still valuable for identifying the larger product gap: there is still no complete persistent Commerce server domain.

## Current roadmap status

### Completed or materially advanced

| Area | Current evidence | Status |
|---|---|---|
| Login and auth | `packages/server/src/domains/auth` | Complete for current scope |
| Documents/CMS | `packages/server/src/domains/documents` | Complete for current scope |
| Admin shell and CMS | `packages/client`, `packages/extensions` | Core complete |
| Store slug | tenant resolve and edge/client slug flow | Complete |
| Commerce extension shell | `packages/extensions/src/commerce` | Working foundation |
| Cart machine definition | Commerce cart machine and machine API | Working foundation |
| Evidence Kernel | `packages/server/src/domains/evidence` | Implemented |
| Commerce order projection | `packages/verticals/src/commerce/order-projection.ts` | Implemented |
| Orders admin read UI | `packages/extensions/src/commerce/orders-admin.tsx` | Implemented |
| Deterministic demo seeding | `packages/seeding` and Commerce seed profile | Implemented |
| Shared fixtures | `packages/fixtures` | Initial package implemented |

### Still incomplete

| Area | Evidence | Gap |
|---|---|---|
| XState integration sign-off | `docs/2026-09-08/XSTATE-REUSE-MIGRATION-PLAN.md` | Live cart reload smoke and final sign-off remain explicitly open |
| Commerce server domain | No `packages/server/src/domains/commerce/` | No complete products, inventory, cart persistence, orders, or checkout domain |
| Persistent cart | `packages/verticals/src/commerce/capabilities.ts` and machine routes | Current flow is not a complete server cart model with guest/login merge |
| Checkout fulfillment | Commerce capability and provider mapping exist | No complete production order fulfillment/inventory transaction boundary |
| Storefront catalog | Only initial Commerce components exist | ProductGrid, ProductInfo, CartDrawer, CartSummary, checkout UI, search/pagination remain |
| Behavioral checkout E2E | Unit/contract tests exist | Need live provider or provider-faithful callback flow through persisted state and projection |
| Visual editor acceptance | Implementation is broad | Remaining smoke/sign-off should be tracked separately from Commerce foundation |
| Edge production concerns | Workers status is partial in older docs | Bot SSR/hydration/caching production proof remains separate |

## Why XState Phase E is first

The machine migration document states:

- Phase C implementation is complete for flat-state machines.
- Live cart reload smoke and final integration sign-off remain.
- The acceptance criteria require start → transition → reload instance → transition again.
- The migration must prove ephemeral actors reconstruct from persisted `currentState` and `context`.
- The cart flow must remain green for guest add, login, claim, and owner stamping.

The authoritative `CHECKOUT-RELIABILITY-PLAN.md` lists this as Workstream 1 and explicitly requires the live smoke before Workstreams 2–4 are considered complete. The current unit test already proves a local in-memory version of this behavior in:

```text
packages/server/src/domains/machines/engine.test.ts
```

That is strong evidence for the engine contract, but it is not the same as live API/cart verification. The missing proof is specifically an integration boundary, not another engine rewrite.

### XState Phase E acceptance checklist

1. Run complete machine-domain tests.
2. Run Commerce cart capability tests.
3. Start a cart through the API.
4. Persist a transition.
5. Reload the instance through the API or a new request context.
6. Transition again through the API.
7. Confirm state and context are preserved.
8. Confirm no duplicate guard invocation.
9. Confirm the existing cart owner/claim behavior.
10. Confirm `pnpm test`, typechecks, and build.
11. Update `XSTATE-REUSE-MIGRATION-PLAN.md` from open sign-off to complete only after live proof.

Do not add snapshot persistence yet. The migration plan explicitly says to prove flat-state reconstruction first and add snapshots only when compound/history/parallel/child-actor state requires them.

## Workstreams 2 and 3 are implemented but not proven live

`CHECKOUT-RELIABILITY-PLAN.md` records two implementations that are code-complete but lack live database/queue evidence:

| Workstream | Implemented | Missing evidence |
|---|---|---|
| 2 — durable capability idempotency | `capability_idempotency` storage, route claim/replay/conflict/retry | `db:push` plus concurrent-request proof against Postgres |
| 3 — provider-event reliability | `provider_event_receipts`, Nango ingress claim, worker completion/failure | real Nango → BullMQ → worker → machine transition |

Workstream 4 (full callback-to-`paid` E2E) remains unautomated and is documented as such in the plan baseline.

This means the next work is primarily **integration proof**, not new architecture. That is the cheapest, highest-confidence way to move the roadmap.

## Why Commerce server domain comes immediately after

The product roadmap identifies Commerce Engine as the largest remaining product gap. The current implementation has useful vertical behavior:

```text
checkout capability
→ checkout_started
→ provider callback normalization
→ PAYMENT_SUCCEEDED
→ order projection
→ Evidence records and links
```

But this is not yet a complete Commerce domain. There is no dedicated:

```text
packages/server/src/domains/commerce/
```

The next product implementation should establish a domain-owned server boundary rather than adding more seed data or more admin-only projections.

### Suggested Commerce server-domain slices

#### Slice 1: catalog and product contract

- Product/variant value model
- Price and currency validation
- Inventory reservation interface
- Product read service/ports
- Tenant-scoped routes or document integration boundary

#### Slice 2: persistent cart

- Guest cart identity
- Authenticated cart ownership
- Cart item and price snapshot model
- Guest-to-user merge
- Idempotent add/update/remove operations
- Machine instance as workflow state, not the complete cart database model

#### Slice 3: checkout boundary

- Checkout service port
- Provider-neutral checkout session contract
- Stripe adapter behind the port
- Idempotency key handling
- Webhook receipt normalization
- Tenant/provider configuration lookup

#### Slice 4: order and inventory transaction

- Order creation after verified payment success
- Inventory reservation/decrement policy
- Order status transitions
- Duplicate callback protection
- Projection to Evidence after the order transaction is durable
- `paid_by` and `caused_by` links retained as audit relationships

#### Slice 5: behavioral verification

- Provider-faithful success callback
- Failure callback
- Duplicate callback
- Expired checkout
- Inventory failure
- Cart reload and checkout restart
- Orders admin projection verification

## What should not be next

### Do not build more generic seed infrastructure

`packages/seeding` now has the correct initial boundary. More generic runner work should wait until a concrete profile needs it.

### Do not add Commerce routes to platform client core

The recent architecture correction is right:

```text
Commerce UI/actions → Commerce extension
Generic admin shell → platform client
```

### Do not add a browser-facing Evidence write API

Evidence writes should continue through trusted domain/application ports. The browser-facing API remains generic and read-oriented.

### Do not start advanced infrastructure scaling

Nango expansion, Typesense, Vela, multi-region deployment, and advanced ClickHouse scaling are not on the critical path for proving the core Commerce product locally.

### Do not add XState snapshot persistence speculatively

First finish the flat-state reload proof. Add a versioned snapshot only when a real machine requires metadata that cannot be reconstructed from state/context.

## Updated priority roadmap

```text
P0  Close XState Phase E integration sign-off
    ↓
P1  Establish server Commerce domain ports and persistence boundaries
    ↓
P1  Persistent cart with guest/authenticated ownership and merge
    ↓
P1  Checkout provider boundary and webhook fulfillment
    ↓
P1  Order/inventory transaction + Evidence projection
    ↓
P1  Behavioral checkout E2E and live Orders verification
    ↓
P1  Complete Commerce catalog/storefront components
    ↓
P2  Visual editor final smoke and production hardening
    ↓
P2  Custom domains, edge SSR/hydration, and production deployment concerns
    ↓
P3  Shopify mode, advanced commerce, marketplace, and ecosystem work
```

## Final recommendation

The next implementation task should be the **XState Phase E live cart reload and integration sign-off**, with no new public API or schema expansion unless the test proves it necessary.

Immediately after that, begin the **server Commerce domain**. The goal is not another demo fixture; it is:

```text
real cart persistence
→ real checkout session
→ verified provider callback
→ durable order/inventory change
→ Evidence projection
→ Orders admin read model
```

That sequence closes the gap between the currently working architecture demo and the actual product roadmap.
