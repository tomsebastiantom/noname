---
title: ADR-0009 — Evidence and provenance kernel
sidebar_position: 9
status: accepted
owner: server/evidence
recorded: 2026-09-14
last_verified: 2026-09-14
source_documents:
  - docs/2026-09-12/AUDITABLE-RECORDS-DESIGN-START.md
implementation_evidence:
  - packages/server/src/domains/evidence
  - packages/verticals/src/commerce/order-projection.ts
---

# ADR-0009: Evidence and provenance kernel

- **Status:** accepted
- **Date:** 2026-09-14

## Context

Multiple domains need immutable, auditable records and typed relationships without creating domain-specific read APIs in the generic platform.

## Decision

The generic Evidence domain owns immutable records, activities, links, audit reads, persistence, and tenant boundaries. Verticals own the meaning of record types and projections. The browser receives generic reads; it does not write Evidence directly.

## Consequences

- Commerce can project order/payment outcomes without making Evidence Commerce-specific.
- Other verticals can reuse the kernel.
- Orders admin reads generic Evidence and remains Commerce-owned.

## Evidence

- `packages/server/src/domains/evidence`
- `packages/verticals/src/commerce/order-projection.ts`
- `packages/extensions/src/commerce/orders-admin.tsx`
