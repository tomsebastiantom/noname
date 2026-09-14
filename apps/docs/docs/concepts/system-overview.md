---
title: System overview
sidebar_position: 1
status: current
owner: platform
last_verified: 2026-09-14
audience: [developer, architect]
---

# System overview

Noname is a declarative full-stack platform. A specification can drive content, UI, backend machines, capabilities, and integrations while domain-owned verticals provide business meaning.

## Main flow

```text
browser
  → generic route or extension action
  → server domain/capability
  → persistence or machine transition
  → provider/worker boundary when needed
  → normalized event and durable state
  → domain-owned UI or Evidence read
```

## Layers

- **Platform** — identity, documents, layouts, machines, capabilities, integrations, Evidence, notifications, analytics, and generic persistence boundaries.
- **Verticals** — business semantics such as Commerce capabilities and order projection.
- **Extensions** — vertical-owned components, actions, schemas, and admin/storefront UI.
- **Workers and edge** — asynchronous provider processing and edge delivery/personalization.

## Current authority

XState is the transition authority for machine behavior. Persisted `currentState` and `context` are reloaded into ephemeral actors for each request.

## Read next

- [Package boundaries](../architecture/package-boundaries)
- [Machines and XState](./machines-and-xstate)
- [Evidence and provenance](./evidence-and-provenance)
