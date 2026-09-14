# Seed Architecture and `packages/seeding`

> **Date:** 2026-09-14  
> **Status:** Architecture and initial implementation

## Purpose

Noname has several kinds of seed data:

1. Platform bootstrap data: tenants, users, roles, Keto tuples, layouts, content types, pages, routing, and email specs.
2. Extension/demo data: Commerce catalog configuration, products, cart machine definitions, and a paid order evidence fixture.
3. Behavioral test data: checkout transitions, provider callbacks, replayed callbacks, and persisted machine state.

These must not all use the same write mechanism or be conflated into one giant script.

## Existing seed inventory

```text
packages/seeding/src/cli.ts
  Profile CLI for platform, commerce, and full demo seeds.

packages/seeding/src/profiles/platform/
  Platform demo orchestration, users, Keto tuples, labels, specs, content types,
  email specs, and seed assets.

packages/seeding/src/profiles/commerce/
  Commerce demo orchestration for catalog/product/cart setup and evidence fixture wiring.

packages/verticals/src/commerce/demo-order-evidence.ts
  Commerce-owned deterministic evidence fixture semantics.

packages/server/src/domains/evidence/adapters/postgres.ts
  Server-owned persistence adapter used by trusted internal seed wiring.
```

## Boundary decision

### Use application APIs for normal application resources

Use the authenticated HTTP seed client for resources that have a legitimate application workflow:

- layouts
- documents
- content types
- page routing
- tenant catalog configuration
- users and access setup

This exercises authentication, validation, authorization, publication, and cache behavior.

### Use internal ports for intentionally non-public writes

Evidence has no browser-facing write API by design. A seed-only HTTP write endpoint would create a permanent mutation surface and blur the read-only evidence boundary.

For deterministic internal evidence fixtures, use:

```text
trusted seed runner
  → Commerce seed module
  → EvidenceService-compatible port
  → Postgres adapter
```

The seed must not write raw SQL. It must use the same port shape and idempotency semantics as the production Commerce projector.

### Use real workflows for behavioral E2E

A fixture seed proves that the Orders read UI can render a paid order and links. It does not prove checkout correctness.

Behavioral E2E should use:

```text
cart machine
  → awaiting_payment
  → provider callback normalization
  → PAYMENT_SUCCEEDED
  → persisted paid state
  → awaited Commerce projector
  → evidence records and links
```

This is a separate test profile from deterministic demo seeding.

## `packages/seeding` design

`packages/seeding` is a small orchestration package, not a domain model and not a second database layer.

It owns:

- seed execution context
- profile/step orchestration
- dependency ordering
- deterministic clock and run metadata
- structured logging
- dry-run/profile metadata hooks

It does not own:

- Commerce order semantics
- Evidence schema semantics
- SQL persistence
- public API write routes
- domain-specific fixtures

Domain packages own their seed modules. For example:

```text
packages/verticals/src/commerce/seeding/
  demo-order-evidence.ts
  demo-product.ts
  demo-cart.ts
```

The initial Commerce evidence module is currently exported from:

```text
packages/verticals/src/commerce/demo-order-evidence.ts
```

It can move under a `seeding/` directory once more Commerce fixtures exist.

## Profiles

Recommended profiles:

```text
platform
  Base Noname admin and CMS demo.

commerce
  Commerce catalog, product, cart machine, and order evidence fixture.

full
  Platform followed by Commerce.

behavioral-e2e
  Real checkout/provider callback flow; not a fixture seed.
```

The new profile commands are:

```text
pnpm seed:demo             # platform profile
pnpm seed:demo:commerce    # commerce profile
pnpm seed:demo:full        # platform → commerce
```

All profiles execute through `packages/seeding/src/cli.ts`. The old `scripts/seed` tree is intentionally removed; seed orchestration now belongs to the package.

## Idempotency requirements

Every seed step should be safe to rerun.

Use:

- stable fixture identifiers
- deterministic idempotency keys
- upsert/update APIs for mutable CMS setup
- existence checks for links and tuples
- explicit seed version/profile logging

The demo order uses:

```text
commerce:demo:order:1001
commerce:demo:payment:1001
commerce:demo:activity:payment-succeeded:1001
```

## Open-source comparison

This design follows common patterns in established projects:

- Medusa recommends custom CLI seed scripts that resolve application/module services and workflows rather than adding public seed endpoints: [Medusa custom CLI seed scripts](https://docs.medusajs.com/learn/fundamentals/custom-cli-scripts/seed-data)
- Vendure exposes a dedicated populate mechanism that uses configured application services: [Vendure Populate](https://docs.vendure.io/current/core/reference/typescript-api/import-export/populate)
- Prisma treats seeding as a separate project command and lifecycle concern: [Prisma seeding](https://www.prisma.io/docs/orm/prisma-migrate/workflows/seeding)
- Drizzle documents seed operations as a separate development/database workflow: [Drizzle seeding](https://orm.drizzle.org/docs/seed-overview)

The common pattern is:

```text
seed CLI
  → application/domain services or ports
  → persistence adapter
```

not:

```text
browser
  → special seed API
  → database
```

## Implementation status

1. The generic `packages/seeding` context and dependency-aware runner are implemented.
2. Platform and Commerce orchestration live under `packages/seeding/src/profiles`.
3. Domain fixture semantics remain in Commerce-owned modules.
4. The `full` profile composes platform before Commerce.
5. Behavioral checkout verification remains separate from fixture seeding.

## Verification contract

For each profile, report:

```text
profile
seed version
steps executed
steps skipped or already present
organization/store scope
errors
```

For live Commerce verification:

```text
seed Commerce fixture
→ login with admin
→ open /admin/orders
→ confirm order row
→ select order
→ confirm /api/evidence/links/:recordId = 200
→ confirm paid_by and caused_by links
→ confirm browser console has no errors
```
