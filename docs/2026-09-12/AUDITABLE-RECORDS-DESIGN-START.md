# Auditable Records Design — Starting Point

> **Status:** Research starting point — not yet an implementation decision  
> **Date:** 2026-09-12

## Problem

Noname needs a reusable way to represent non-editable, auditable facts and records across domains without forcing transactional data into the CMS Documents domain.

Candidate consumers include:

- Commerce orders and payments
- Bookings and reservations
- Analytics summaries and traces
- Blog publication history
- Architecture decisions
- Deployments and incidents
- Recordings and evidence attachments

## Initial separation

The first design separates five concepts:

1. **Documents** — editable, versioned CMS content.
2. **Aggregates** — domain-owned mutable state with business invariants.
3. **Events** — immutable facts that happened.
4. **Records** — immutable externally meaningful evidence or snapshots.
5. **Projections** — read models optimized for a domain UI or query.

The shared platform should provide technical record infrastructure, while each domain owns its payload, invariants, lifecycle, and projections.

## Initial candidate architecture

```text
Domain aggregate
  → domain event
  → shared immutable record/event kernel
  → typed record links
  → domain-owned projection/read model
  → API/admin/reporting
```

Potential shared primitives:

- Tenant-scoped immutable envelopes
- Append-only event storage
- Typed links between records
- Correlation and causation IDs
- Idempotency keys
- Integrity hashes
- Retention and legal-hold metadata
- Redaction/tombstone records
- Projection checkpoints
- Domain-owned payload schemas

Potential domain-owned storage:

```text
commerce_orders / commerce_order_events
bookings / booking_events
analytics_events
```

The shared kernel must not become an untyped universal `records(data JSONB)` dumping ground.

## Research questions

Before implementation, compare open-source and technical approaches for:

- Event sourcing versus immutable audit records
- Current-state aggregates plus append-only events
- Typed links and graph-like relationships
- Projection rebuild and versioning
- Idempotency and deduplication
- Schema evolution for immutable payloads
- Tenant isolation and authorization
- PII retention, redaction, and legal holds
- High-volume analytics versus transactional records
- Attachments and recordings in object storage
- Operational complexity and migration strategy

## Acceptance criteria for the research

The follow-up research document must:

- Compare at least Medusa, Vendure, Saleor, EventStoreDB, Temporal, and one audit-log approach.
- Identify concrete failure modes and tradeoffs from real implementations.
- Separate reusable infrastructure from domain-specific behavior.
- Recommend a staged Noname implementation rather than a speculative platform-wide rewrite.
- Define what should remain in Documents and what belongs in Records/Audit.
