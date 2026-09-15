---
title: ADR-0001 — The platform contract is the reusable foundation
sidebar_position: 1
status: accepted
owner: platform
recorded: 2026-09-14
last_verified: 2026-09-14
---

# ADR-0001: The platform contract is the reusable foundation

- **Status:** accepted
- **Date:** 2026-09-14

## Context

Noname should support many products and verticals without rebuilding identity, content, layouts, rendering, workflows, integrations, analytics, agents, and provenance for every product.

## Decision

Treat declarative specifications plus the shared runtime capabilities as the platform contract. Verticals add business semantics; extensions add domain presentation and actions; clients render compatible specifications.

```text
intent/specification
  → shared platform runtime
  → vertical capabilities
  → extension/client surface
  → observable and auditable product
```

## Consequences

- Product-specific behavior must have an explicit ownership boundary.
- Generic primitives should be designed for reuse.
- Agents should propose changes to contracts/specifications, not opaque one-off patches.
- Commerce is a proving ground, not the platform identity.

## Evidence

- `packages/server/src/domains`
- `packages/documents`
- `packages/client/src/editor`
- `packages/verticals`
- `packages/extensions`
- `docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md`
