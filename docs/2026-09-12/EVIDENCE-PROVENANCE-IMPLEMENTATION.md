# Evidence and Provenance Server Domain

> **Date:** 2026-09-12  
> **Status:** Server implementation with commerce integration

## What was implemented

The server now has a shared `evidence` domain with four immutable primitives:

- `evidence_records` — immutable domain evidence/snapshots
- `evidence_activities` — immutable activities/facts with actors and input/output IDs
- `evidence_links` — tenant-scoped typed relationships between evidence entities
- `evidence_audit_events` — immutable audit metadata for security/compliance actions

The domain is registered in `createApp()` and its schema is registered in the central Drizzle database configuration.

## Ownership boundary

The server domain owns infrastructure guarantees:

- Tenant-scoped persistence
- Idempotent append by `(org_id, type, idempotency_key)`
- Idempotent links by `(org_id, from_id, to_id, relation)`
- Append-only service methods
- Correlation and causation IDs
- Recorded/occurred timestamps
- Optional integrity hashes
- Bounded list reads
- Cross-tenant endpoint rejection for links

Domain extensions own:

- Event and record type names
- Payload schemas
- Aggregate invariants
- Domain state transitions
- Projection/read models
- Which evidence is emitted and when

## API boundary

The server exposes read-only authenticated routes:

```text
GET /api/evidence/records
GET /api/evidence/links/:recordId
GET /api/evidence/audit
```

There are deliberately no browser-facing write routes. Domain extensions and trusted server effects use the exported `EvidenceService` port. This prevents a browser from forging payment, order, booking, or audit facts.

Organization identity comes from the authenticated server context and is never read from a request body or query parameter.

## Idempotency and immutability

Writes use inserts only. There are no update or delete methods.

Record, activity, and audit retries can provide an idempotency key. A duplicate retry returns the original row. Links use a unique edge constraint and return the existing edge when replayed.

Before creating a link or activity reference, the Postgres adapter verifies that each referenced evidence ID exists in the same organization. This prevents cross-tenant and dangling evidence relationships.

## Why analytics is not included

Noname already has a ClickHouse analytics implementation. This domain does not add analytics ingestion, storage, retention, or dashboards. It only preserves generic correlation/causation fields that domain records may use to reference existing telemetry.

## Verification

Focused route tests cover:

- Authenticated organization scoping
- No browser-facing write route
- Invalid UUID rejection
- Invalid list limit rejection

Commands executed:

```text
pnpm --filter @noname/server typecheck
pnpm exec biome check packages/server/src/domains/evidence packages/server/src/drizzle.ts packages/server/src/bootstrap.ts packages/server/drizzle.config.ts
pnpm exec vitest run --config vitest.config.ts packages/server/src/domains/evidence/routes.test.ts
pnpm test
pnpm --filter @noname/server db:push
```

Results:

- Focused evidence tests: 3 passed
- Full repository tests: 149 files, 527 tests passed
- Server typecheck: passed
- Biome check: passed
- Local Postgres schema push: applied successfully

## Commerce integration

Commerce now consumes the server port through `createCommerceOrderProjector`.

The machine engine invokes the projector from its awaited `onTransitionComplete` hook, after the authoritative state update succeeds. The projector accepts only `PAYMENT_SUCCEEDED` from the commerce `cart` machine, so unrelated platform machines cannot create commerce orders.

```text
MachineEngine PAYMENT_SUCCEEDED
  → commerce order projector
  → commerce.order.created record
  → commerce.payment.receipt record
  → commerce.payment_succeeded activity
  → paid_by / caused_by links
```

The projector derives all values from the persisted machine context and normalized transition parameters. It does not accept browser prices, browser ownership, or redirect state.

The projection is idempotent by:

```text
commerce:order:<machine-instance-id>
commerce:payment:<payment-reference>
commerce:payment-succeeded:<machine-instance-id>
```

The commerce domain owns the semantic type names and payload meaning. The server evidence domain owns persistence and tenant/idempotency guarantees.

The order aggregate and future order read model remain commerce-owned. Evidence records the durable facts and relationships without becoming a generic order domain.

## Commerce verification

Additional focused tests cover:

- Projection only after `PAYMENT_SUCCEEDED`
- Order and payment receipt creation
- Activity input/output references
- Typed relationship creation
- Machine-context-derived order/payment references
- Ignoring failed payment transitions

Commands:

```text
pnpm --filter @noname/verticals typecheck
pnpm exec vitest run --config vitest.config.ts packages/verticals/src/commerce/order-projection.test.ts
pnpm --filter @noname/server build
```
