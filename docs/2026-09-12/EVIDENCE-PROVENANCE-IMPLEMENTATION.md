# Evidence and Provenance Server Domain

> **Date:** 2026-09-12  
> **Status:** Initial server implementation

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
- Full repository tests: 148 files, 525 tests passed
- Server typecheck: passed
- Biome check: passed
- Local Postgres schema push: applied successfully

## Next domain integration

The next consumer should be commerce order projection:

```text
MachineEngine PAYMENT_SUCCEEDED
  → commerce-owned order projection
  → EvidenceService.appendActivity()
  → EvidenceService.appendRecord()
  → EvidenceService.link()
```

The order aggregate and order read model remain commerce-owned. The evidence domain records the durable facts and relationships without becoming a generic order domain.
