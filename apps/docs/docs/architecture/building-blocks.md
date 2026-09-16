---
title: Architecture building blocks
sidebar_position: 4
status: current-and-evolving
owner: platform
last_verified: 2026-09-14
audience: [agent, contributor, architect]
---

# Architecture building blocks

Use these blocks to compose a feature without inventing a new subsystem for every request.

| Need | Use | Review question |
|---|---|---|
| Content and page structure | Documents, content types, layouts | Is the contract reusable across products? |
| User-visible UI | JSON-render catalog and extension registry | Is the component schema explicit? |
| Durable stateful behavior | JSON machine + XState | What are states, events, guards, and reload rules? |
| Server execution | Generic capability | Is it authenticated, tenant-scoped, and idempotent? |
| External provider | Nango/provider adapter | Is the provider effect receipt-backed and normalized? |
| Async work | BullMQ worker | What is retryable and how is status exposed? |
| Identity | ZITADEL + Noname auth guards | Who owns the actor and what can it access? |
| User/agent collaboration | Editor task/review/collab contracts | Can the person inspect and approve the proposal? |
| Performance/personalization | Edge renderer/context | Is the decision safe to cache and free of durable mutation? |
| Product learning | Analytics, ClickHouse, replay | Is the data scoped and separate from business truth? |
| Auditability | Evidence and typed links | What outcome needs immutable provenance? |

## Feature recipe

```text
choose user outcome
  → select reusable blocks
  → define contract and ownership
  → implement focused source/test
  → expose state and evidence
  → document current behavior and decision
```

- [Building an application](./building-an-application)
- [Data flows](./data-flow)
- [Platform capability map](./platform-capability-map)
