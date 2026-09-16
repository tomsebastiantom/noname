---
title: Control planes, runtime, and observation
sidebar_position: 3
status: current-and-evolving
owner: platform
last_verified: 2026-09-14
audience: [agent, architect, operator]
---

# Control planes, runtime, and observation

Noname becomes easier to reason about when the system is separated into control, runtime/data, and observation planes.

## Control plane

The control plane defines what the product is allowed to be and who can change it.

```mermaid
flowchart TB
  identity[ZITADEL identity and roles] --> auth[Noname auth and scope]
  auth --> admin[Admin and visual editor]
  auth --> agent[Registered agents and tools]
  admin --> specs[Documents, layouts, content types]
  agent --> proposals[Tasks, proposals, insights]
  specs --> catalog[Catalog and extension contracts]
  proposals --> review[Review, approval, publish]
  review --> specs
```

Control-plane data includes identity, permissions, content schemas, layout specs, agent registration, tool allowlists, feature configuration, and publish state.

## Runtime/data plane

The runtime plane serves users and performs durable work.

```mermaid
flowchart LR
  client[Web/native client] --> edge[Edge delivery]
  edge --> api[Origin API]
  api --> domain[Domain service]
  domain --> machine[Machine/capability]
  machine --> db[(Postgres)]
  machine --> queue[BullMQ]
  queue --> worker[Async worker]
  worker --> provider[External provider]
  provider --> receipt[Durable receipt]
  receipt --> machine
```

Runtime data includes documents, published versions, machine state/context, capability idempotency, provider receipts, order projections, and other domain state.

## Observation plane

The observation plane tells people and agents what happened.

```mermaid
flowchart TB
  web[Browser and edge] --> events[Analytics events]
  api[API and workers] --> traces[Traces/logs/metrics]
  machine[Machines and capabilities] --> evidence[Evidence and audit]
  web --> replay[Session replay]
  events --> analytics[(ClickHouse)]
  replay --> storage[(Object storage)]
  traces --> ops[Operations and alerts]
  analytics --> insight[Agent insight]
  evidence --> review[User/agent review]
  ops --> review
  insight --> review
```

## Why the separation matters

- A control-plane change can be reviewed before it affects runtime.
- Runtime data is not confused with analytics projections.
- Observation can explain failures without becoming the owner of business truth.
- Agents can analyze observation data while remaining constrained by control-plane permissions.

## Failure and alert model

A useful operational status includes:

```text
healthy
warning
blocked
retrying
failed
stale
requires-review
```

An alert should identify:

- what changed
- which tenant/product is affected
- first observed time
- evidence or trace ID
- current state
- suggested next action
- whether an agent may act automatically

## Related

- [Identity and integrations](./identity-and-platform-integrations)
- [Analytics and agent operations](../concepts/analytics-observability-agents)
- [Decision and evidence guide](./decision-and-evidence-guide)
