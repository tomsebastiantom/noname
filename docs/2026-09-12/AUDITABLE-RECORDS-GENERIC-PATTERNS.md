# Auditable Records — Generic Pattern Investigation

> **Date:** 2026-09-12  
> **Scope correction:** Analytics storage and analytics implementation are explicitly out of scope. Noname already has a ClickHouse analytics implementation. This document focuses on reusable cross-domain record, provenance, link, audit, and evidence patterns.

## New direction

The generic abstraction should not be called a generic business record. It should be a **provenance and evidence kernel**.

It should answer:

- What happened?
- To which subject?
- Who or what caused it?
- Which records or entities were used?
- Which records were produced?
- What is this record related to?
- Can the record be trusted, replayed, redacted, or queried?

It should not answer domain questions such as:

- Is an order paid?
- Is a booking available?
- Is a deployment healthy?
- Is a blog post publishable?

Those remain domain-owned.

## Generic patterns found

### 1. CloudEvents for transport envelopes

CloudEvents provides a common event metadata envelope: source, subject, type, ID, time, and content type. It is useful for interoperability between producers and consumers, but it does not define business aggregates, persistence, authorization, or audit retention.

Use CloudEvents-like metadata for transport and integration:

```text
id
source
type
subject
time
datacontenttype
trace/correlation extensions
```

Do not treat CloudEvents alone as the record database.

Reference: [CloudEvents specification](https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md).

### 2. W3C PROV for provenance

W3C PROV is a strong generic conceptual model because it separates:

- **Entity** — something that exists or was produced
- **Activity** — something that happened or transformed data
- **Agent** — a person, service, provider, or organization responsible

It also defines relations such as:

```text
wasGeneratedBy
wasDerivedFrom
wasAttributedTo
used
wasAssociatedWith
```

This maps well across domains:

```text
OrderReceipt      = Entity
PaymentSucceeded  = Activity
StripeConnection  = Agent
```

```text
BlogPublication   = Entity
PublishCommand    = Activity
Editor            = Agent
```

PROV should guide the conceptual link vocabulary, but Noname does not need to implement the complete PROV ontology initially.

Reference: [W3C PROV-DM](https://www.w3.org/TR/prov-dm/).

### 3. Relationship tuples for authorization

OpenFGA's design guidance warns against building an overly generic meta-model and recommends modeling the actual application domain with specific resource types. This is directly relevant to record links.

A link such as:

```text
order belongs_to customer
```

must not automatically become permission.

Use record links for provenance and relationships. Use the authorization system for access decisions:

```text
record link ≠ authorization grant
```

Reference: [OpenFGA authorization model design principles](https://openfga.dev/docs/best-practices/modeling-design-principles).

### 4. Apache Atlas for metadata and lineage

Apache Atlas demonstrates a broad metadata/provenance pattern: entities, lineage, governance metadata, taxonomy, audit, and policy enforcement can interoperate through common metadata relationships.

Useful ideas:

- Typed entities rather than arbitrary blobs
- Lineage relationships
- Metadata consumers decoupled from producers
- Governance metadata separate from business payloads
- Policy enforcement outside the metadata relationship itself

The caution is that Atlas is a large governance platform. Noname should adopt the conceptual lineage pattern, not its full platform scope.

Reference: [Apache Atlas overview](https://apache.googlesource.com/atlas/+show/7f288082e45909d389383c37be846f1be928d861/README.md).

## Recommended generic model

The smallest useful shared kernel is four primitives:

```text
EvidenceRecord
EvidenceActivity
EvidenceLink
EvidenceAudit
```

### EvidenceRecord

An immutable representation of a domain entity or result:

```ts
type EvidenceRecord = {
  id: string;
  orgId: string;
  type: string;
  schemaVersion: number;
  subjectType: string;
  subjectId: string;
  data: unknown;
  source: string;
  occurredAt: string;
  recordedAt: string;
  correlationId?: string;
  causationId?: string;
  integrityHash?: string;
};
```

### EvidenceActivity

An immutable activity/fact:

```ts
type EvidenceActivity = {
  id: string;
  orgId: string;
  type: string;
  actorType: "user" | "service" | "provider" | "system";
  actorId?: string;
  inputRecordIds: string[];
  outputRecordIds: string[];
  occurredAt: string;
  correlationId?: string;
};
```

### EvidenceLink

A typed relationship:

```ts
type EvidenceLink = {
  id: string;
  orgId: string;
  fromId: string;
  toId: string;
  relation: string;
  metadata?: Record<string, unknown>;
};
```

### EvidenceAudit

A security/compliance action about the records system:

```ts
type EvidenceAudit = {
  id: string;
  orgId: string;
  action: string;
  actorId?: string;
  subjectType: string;
  subjectId: string;
  reason?: string;
  occurredAt: string;
  correlationId?: string;
};
```

## Domain examples

### Commerce

```text
CommerceOrder          = domain aggregate
OrderCreated           = EvidenceActivity
OrderReceipt           = EvidenceRecord
PaymentAttempt         = EvidenceRecord
Order paid_by Payment  = EvidenceLink
```

### Bookings

```text
Booking                = domain aggregate
BookingConfirmed       = EvidenceActivity
BookingConfirmation    = EvidenceRecord
Booking reserves Room  = EvidenceLink
```

### Blog

```text
BlogPost               = editable Documents record
BlogPublished          = EvidenceActivity
PublishedRevision      = EvidenceRecord
Publication derived_from BlogPost = EvidenceLink
```

### Architecture

```text
ArchitectureProposal   = editable Documents record
DecisionAccepted       = EvidenceActivity
ArchitectureDecision   = EvidenceRecord
Decision supersedes PreviousDecision = EvidenceLink
```

## Why not one generic table for everything?

A common envelope is useful. A common business table is not.

Keep domain-owned tables when the domain needs:

- Current state with invariants
- Unique constraints
- High-query performance
- Transactional updates
- Domain-specific indexes
- Specialized retention
- Specialized relationships

Use the shared kernel for:

- Immutable facts
- Provenance
- Cross-domain links
- Audit actions
- Correlation
- Integrity metadata

## Failure modes to avoid

### Generic meta-model failure

OpenFGA explicitly warns that a model representing “anything” trades clarity for maintainability and performance.

**Solution:** register specific record/event types and require domain-owned schemas.

### Provenance graph becomes permission graph

A record can be related to another record without granting access.

**Solution:** run authorization separately on every read and relationship traversal.

### Immutable records retain private data forever

**Solution:** encrypt sensitive data, separate identity fields, support redaction tombstones and key destruction.

### Event metadata is mistaken for business truth

CloudEvents provides event metadata, not domain state.

**Solution:** keep aggregates and domain projections separate from transport envelopes.

### Metadata platform becomes too large

Apache Atlas demonstrates the power and complexity of a full governance graph.

**Solution:** begin with four primitives and a small relation registry. Do not build taxonomy, lineage UI, policy engines, and ontology support before a real domain needs them.

### Links become unbounded graph traversal

**Solution:** require typed relations, bounded traversal depth, indexed endpoints, pagination, and explicit query permissions.

### Records and activities are updated in place

**Solution:** append a correction, supersession, or redaction activity. Never silently mutate historical facts.

## Proposed staged implementation

### Stage 1 — vocabulary and ports

Define the types and ports in a shared package without a universal database table.

```text
EvidenceRecordStore
EvidenceActivityStore
EvidenceLinkStore
EvidenceAuditStore
```

### Stage 2 — commerce proof

Use commerce orders as the first implementation because the current checkout path already has:

- Authoritative machine transitions
- Durable provider receipts
- Idempotency
- Correlation IDs
- An admin use case

### Stage 3 — provenance links

Add links such as:

```text
OrderReceipt created_from Cart
OrderReceipt paid_by PaymentAttempt
PaymentAttempt caused_by PaymentSucceeded
```

### Stage 4 — architecture records

Use the same kernel for accepted architecture decisions and deployment records while leaving drafts in Documents.

### Stage 5 — bookings

Add booking-specific aggregates and projections. Reuse only the evidence kernel and link vocabulary.

## Updated scope

Explicitly out of scope for this generic-pattern investigation:

- Analytics ingestion
- ClickHouse schemas
- Analytics retention
- Analytics dashboards
- High-volume event storage

Noname already has an analytics implementation. The generic pattern should preserve correlation references to analytics, not reimplement analytics storage.

## Recommendation

Adopt the name **Evidence and Provenance Kernel** rather than “Generic Records Domain.”

This name communicates that the kernel stores facts, provenance, links, and audit evidence—not arbitrary business objects.

The first implementation should be a small commerce proof, followed by architecture/deployment records. Bookings can then validate that the pattern is genuinely cross-domain.

## Sources

- [CloudEvents specification](https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md)
- [W3C PROV-DM](https://www.w3.org/TR/prov-dm/)
- [OpenFGA authorization design principles](https://openfga.dev/docs/best-practices/modeling-design-principles)
- [Apache Atlas overview](https://apache.googlesource.com/atlas/+show/7f288082e45909d389383c37be846f1be928d861/README.md)
