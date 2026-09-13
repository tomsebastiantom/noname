# Auditable Records Research and Architecture Recommendation

> **Date:** 2026-09-12  
> **Status:** Research complete; implementation proposal, not yet implemented  
> **Related starting point:** [`AUDITABLE-RECORDS-DESIGN-START.md`](./AUDITABLE-RECORDS-DESIGN-START.md)

## Executive recommendation

Create a shared **Auditable Records kernel**, but do not create a universal business-domain model and do not move orders/bookings into the Documents domain.

The scalable boundary is:

```text
Domain aggregate
  → immutable domain event
  → shared record/audit kernel
  → typed record links
  → domain-owned projection
  → API, admin, reporting, or external sink
```

The shared kernel owns technical guarantees:

- Tenant isolation
- Append-only persistence
- Correlation and causation
- Idempotency
- Record links
- Redaction/tombstones
- Retention and legal hold
- Integrity metadata
- Projection checkpoints

Each domain owns its meaning:

- Commerce owns orders, payments, fulfillment, and order projections.
- Bookings owns reservations, resources, availability, and booking projections.
- Analytics owns high-volume event ingestion and aggregation.
- Documents owns editable CMS content.
- Architecture tooling owns decisions, deployments, and incident records.

## The five concepts must remain separate

| Concept | Meaning | Examples | Editable? |
|---|---|---|---|
| Document | Authored content with revisions | Blog post, layout, product copy, ADR draft | Yes |
| Aggregate | Domain state with invariants | Order, booking, subscription, inventory reservation | Through commands only |
| Event | Immutable fact that happened | PaymentSucceeded, BookingConfirmed, BlogPublished | No |
| Record | Immutable externally meaningful evidence/snapshot | Receipt, publication record, deployment record | No |
| Projection | Query-optimized read model | Orders admin table, booking calendar, audit timeline | Rebuildable |

A payment event is not an order. An order is not an audit entry. An admin table is not the source of truth.

## Research comparison

### Medusa

Medusa models orders as a dedicated Order Module entity with order-specific fields and relationships, including customer, region, currency, items, transactions, returns, and other commerce concerns. Its module approach allows order functionality to connect to other modules without forcing everything into a generic platform table.

**Strengths:**

- Dedicated transactional order model
- Clear relationships to payment and fulfillment concerns
- Module boundaries allow commerce capabilities to grow independently
- Explicit order fields are filterable and sortable

**Risks and lessons:**

- The relationship graph becomes large as features grow.
- Module links require stable IDs and careful lifecycle handling.
- A modular domain still needs a clear transaction boundary; module separation alone does not prevent inconsistent cross-module updates.
- The order model should not be copied into a generic record JSON blob.

Reference: [Medusa Order model](https://docs.medusajs.com/resources/references/order/models/Order/index.html.md) and [Medusa Order Module links](https://docs.medusajs.com/resources/commerce-modules/order/links-to-other-modules/index.html.md).

### Vendure

Vendure models `Order` as a dedicated entity with a well-defined state machine. The entity owns order lines, payments, fulfillments, currency, totals, promotions, addresses, and customer relationships.

**Strengths:**

- Explicit state machine for order lifecycle
- Strong relational model for lines, payments, fulfillments, and customers
- Unique public order code separate from internal database identity
- Order state and order placement are distinct concepts
- Domain service APIs centralize operations

**Risks and lessons:**

- State machines require explicit transition rules and versioning.
- A rich aggregate can become too large if fulfillment, payment, pricing, and promotion logic are all placed directly inside it.
- Relational relationships need careful loading and pagination.
- Custom fields are useful extension points but should not replace domain-owned invariants.

References: [Vendure Order entity](https://docs.vendure.io/current/core/reference/typescript-api/entities/order) and [Vendure OrderService](https://docs.vendure.io/current/core/reference/typescript-api/services/order-service).

### Saleor

Saleor separates order state-changing actions from generic content storage. Order operations are implemented through explicit actions/services and expose a structured GraphQL API.

**Strengths:**

- Commands/actions are explicit rather than arbitrary record edits.
- Order state changes are domain operations.
- The API exposes domain-specific mutations and authorization boundaries.
- Webhooks and asynchronous integrations are separate from the order source of truth.

**Risks and lessons:**

- Explicit action APIs require more contracts and test coverage.
- Webhook consumers must handle retries and eventual consistency.
- GraphQL flexibility does not remove the need for domain authorization and pagination.

Reference: [Saleor order actions](https://github.com/saleor/saleor/blob/fe9d1d46388587875a4715a9c85ddd091f3b7a0f/saleor/order/actions.py).

### Event sourcing and CQRS

Event sourcing provides an immutable event history and rebuildable projections. CQRS separates write-side invariants from read-side query models.

**Strengths:**

- Complete history of state changes
- Rebuildable projections
- Natural audit and replay model
- Useful for order, booking, and workflow histories

**Risks and lessons:**

- Event history becomes a permanent compatibility contract.
- Event schema evolution requires upcasters or version-aware readers.
- Rebuilding projections can be operationally expensive.
- Eventual consistency must be visible to users.
- A read model cannot be treated as authoritative during lag or rebuild.
- Event sourcing should be introduced where history and replay justify the complexity, not applied to every CMS document.

### Temporal durable execution

Temporal demonstrates a different but related model: workflow histories must be replayable, deterministic, and compatible with future code versions.

**Strengths:**

- Durable execution history
- Replay tests detect incompatible workflow changes
- Clear separation between deterministic workflow code and external activities
- Useful model for correlation and causation

**Risks and lessons:**

- Workflow history is not a general-purpose business query database.
- Non-deterministic code breaks replay.
- External systems must be accessed through activities/effects.
- History retention and versioning need explicit operational policies.

Reference: [Temporal durable execution and replay](https://learn.temporal.io/tutorials/typescript/background-check/durable-execution/).

### Structured audit logging

The Sphereon EDK audit design is a useful reference for audit-specific concerns. It keeps audit logging separate from real-time events and emphasizes append-only storage, redaction, tenant/actor/correlation enrichment, query APIs, and tamper evidence.

**Strengths:**

- Clear distinction between real-time events and audit records
- Redaction before persistence
- Actor, tenant, trace, and correlation enrichment
- Append-only store with database protection
- Optional hash chaining and signed checkpoints
- Multiple output formats for operational and SIEM consumers

**Risks and lessons:**

- Audit logging should not be confused with a domain aggregate.
- An audit sink should not make every command fail if an external SIEM is unavailable.
- The local durable write/outbox must be separated from asynchronous export.
- Redaction, retention, and legal hold must be designed before storing sensitive payloads.

Reference: [Sphereon Audit Logging](https://docs.sphereon.com/edk/guides/audit/overview).

## Proposed Noname architecture

### Shared kernel

```text
packages/records/
  src/
    envelopes.ts
    domain-events.ts
    record-links.ts
    audit-service.ts
    retention.ts
    redaction.ts
    ports.ts
```

The kernel should expose ports rather than domain-specific services:

```ts
interface RecordStore {
  append(record: ImmutableRecord): Promise<void>;
  get(orgId: string, id: string): Promise<ImmutableRecord | null>;
  list(input: RecordQuery): Promise<ImmutableRecordPage>;
}

interface RecordLinkStore {
  link(input: RecordLinkInput): Promise<void>;
  listRelated(input: RelatedRecordQuery): Promise<RecordLink[]>;
}

interface AuditStore {
  append(event: AuditEvent): Promise<void>;
  query(input: AuditQuery): Promise<AuditEventPage>;
}
```

The kernel must not accept arbitrary unvalidated payloads from the browser. Domain adapters register schemas and server-only writers.

### Suggested storage split

Do not start with one universal table for every workload.

```text
record_events       shared immutable domain facts
record_links        shared typed relationships
audit_events        security/compliance actions
projection_offsets  rebuild/checkpoint state
```

Then domain-owned tables/read models:

```text
commerce_orders
commerce_order_items
commerce_order_events

bookings
booking_events

analytics_events or analytics warehouse adapter
```

The shared record event can reference a domain subject:

```text
record_type = commerce.order.created
subject_type = commerce.order
subject_id = order_id
```

This provides common observability without turning domain state into JSONB-only storage.

## Failure modes and mitigations

### Universal JSON record table becomes a dumping ground

**Failure:** Every domain writes different JSON fields with weak validation. Queries become unreliable and migrations become hidden application code.

**Mitigation:** Domain-owned schemas, schema versions, registered record types, and typed writers. Keep common fields in the envelope only.

### Events are duplicated

**Failure:** Retries create duplicate order/payment/audit events.

**Mitigation:** Unique tenant-scoped idempotency key plus source/event identity. Store the deduplication result before publishing external side effects.

### Events arrive out of order

**Failure:** `Refunded` is applied before `Paid`, or a stale projection overwrites newer state.

**Mitigation:** Aggregate stream version, optimistic concurrency, causal IDs, event sequence numbers, and explicit “unapplied/pending” handling. Do not assume callback receipt deduplication orders different events.

### Projection lag is mistaken for truth

**Failure:** Admin shows an old order status while the projection is rebuilding.

**Mitigation:** Expose projection version/lag metadata, keep authoritative aggregate state separate, and make rebuild status visible to operators.

### Event schema changes break replay

**Failure:** Old event payloads cannot be interpreted by new code.

**Mitigation:** Immutable schema versions, upcasters/compatibility readers, replay fixtures, and never silently reinterpret old fields.

### Immutable records conflict with privacy deletion

**Failure:** “Immutable forever” retains personal data beyond legal requirements.

**Mitigation:** Separate identity/personal data from immutable facts, encrypt sensitive payloads, support redaction tombstones and key destruction, record that redaction occurred without retaining the secret value.

### Audit exporter outage blocks business commands

**Failure:** A SIEM outage prevents checkout or admin actions.

**Mitigation:** Persist a local audit/outbox record transactionally, then export asynchronously with retries. The command should only fail when the required local durability guarantee cannot be met.

### Links become invalid or unauthorized

**Failure:** Links point to deleted records or expose cross-tenant data.

**Mitigation:** Tenant-scoped foreign keys where possible, typed relation registry, query-time authorization on both endpoints, and tombstone semantics instead of hard deletion for auditable subjects.

### Analytics volume overwhelms transactional storage

**Failure:** High-volume events compete with orders and audit queries.

**Mitigation:** Keep the event envelope compatible, but use a separate analytics adapter/warehouse. Store only summaries or correlation references in transactional Postgres.

### Domain projections become hidden business logic

**Failure:** An admin read model starts mutating orders or inventing state transitions.

**Mitigation:** Projections are read-only. Commands go through the owning aggregate/effect boundary. Rebuilds must be deterministic and observable.

### Links are mistaken for authorization

**Failure:** A `belongs_to` or `shared_with` link accidentally grants access.

**Mitigation:** Links describe relationships only. Authorization remains a separate policy decision using tenant, actor, role, and resource scope.

## Documents domain boundary

Keep the current Documents domain for:

- Draft and published content
- Layouts
- Product descriptions
- Blog posts
- Templates
- Architecture proposals before approval

Use immutable records for:

- BlogPublished
- ArchitectureDecisionAccepted
- DeploymentCompleted
- OrderCreated
- PaymentSucceeded
- BookingConfirmed
- Audit actions

The relationship is:

```text
editable document
  → command
  → immutable publication/decision record
```

An order should not be a normal document. If the admin UI needs a document-shaped read view later, it can be a read-only projection backed by the commerce order model; it should not become the source of truth.

## Staged implementation plan

### Phase 1 — contracts only

- Define immutable record envelope.
- Define typed event and link contracts.
- Define schema version and idempotency requirements.
- Add test fixtures for append, duplicate, link, and tenant isolation.

### Phase 2 — commerce proof

- Add commerce-owned order aggregate/projection port.
- Add relational commerce order adapter.
- Project only from authoritative `PAYMENT_SUCCEEDED`.
- Add order event and payment links.
- Add Orders admin read API.

### Phase 3 — shared audit kernel

- Add tenant/actor/correlation enrichment.
- Add redaction policy.
- Add local durable outbox and async sinks.
- Add append-only protection and retention metadata.

### Phase 4 — bookings and technical records

- Reuse the kernel for booking events and architecture/deployment records.
- Keep domain state and projections separate.
- Add typed links between records.

### Phase 5 — analytics adapter

- Keep high-volume analytics out of transactional tables.
- Use the same correlation and record identity concepts.
- Add warehouse/object-storage adapter only when volume requires it.

## Final recommendation

Proceed with a **shared Auditable Records kernel plus domain-owned aggregates and projections**.

Do not:

- Put orders in Documents.
- Put bookings in a generic order model.
- Use one JSONB table as every domain's database.
- Treat audit events as real-time pub/sub.
- Treat projections as authoritative state.
- Make links grant authorization.
- Force analytics into transactional Postgres.

The first concrete implementation should be commerce order projection because it exercises the most important boundaries: authoritative transitions, idempotent projection, links, admin reads, tenant security, and audit history. Later domains should consume the kernel only after the commerce proof exposes real reusable behavior.

## Sources

- [Medusa Order model](https://docs.medusajs.com/resources/references/order/models/Order/index.html.md)
- [Medusa Order Module links](https://docs.medusajs.com/resources/commerce-modules/order/links-to-other-modules/index.html.md)
- [Vendure Order entity](https://docs.vendure.io/current/core/reference/typescript-api/entities/order)
- [Vendure OrderService](https://docs.vendure.io/current/core/reference/typescript-api/services/order-service)
- [Saleor order actions](https://github.com/saleor/saleor/blob/fe9d1d46388587875a4715a9c85ddd091f3b7a0f/saleor/order/actions.py)
- [Temporal durable execution and replay](https://learn.temporal.io/tutorials/typescript/background-check/durable-execution/)
- [Sphereon audit logging](https://docs.sphereon.com/edk/guides/audit/overview)

## Source feedback note

The Medusa documentation page includes a feedback mechanism for reporting incorrect, outdated, or confusing documentation. Feedback should be submitted through the documentation site's published agent feedback endpoint when a specific actionable issue is found.
