---
title: Evidence and provenance
sidebar_position: 4
status: current
owner: server/evidence
last_verified: 2026-09-14
audience: [developer, extension-author, architect]
---

# Evidence and provenance

Noname uses immutable Evidence records and typed links to make important domain outcomes auditable without making the generic server domain Commerce-specific.

## Mental model

```text
Commerce event
  → immutable Evidence record
  → typed Evidence links
  → generic Evidence read API
  → domain-owned presentation
```

## Ownership

The generic Evidence domain owns persistence, tenant boundaries, immutability, querying, and audit reads.

Commerce owns order/payment meaning, Commerce record types, typed relationships such as `paid_by` and `caused_by`, and the Orders admin presentation.

## What it is not

Evidence is not a mutable order aggregate, browser-facing write API, analytics warehouse, or replacement for domain persistence.

## Read paths

```text
GET /api/evidence/records
GET /api/evidence/links/:recordId
GET /api/evidence/audit
```

- [Evidence API](../reference/api/evidence)
- [Evidence ADR](../decisions/ADR-0009-evidence-provenance-kernel)
