---
title: Data flows and event flows
sidebar_position: 2
status: current-and-evolving
owner: platform
last_verified: 2026-09-14
audience: [agent, contributor, architect]
---

# Data flows and event flows

Architecture is easier to review as flows than as a list of packages. These diagrams show what moves, where it is validated, and where it becomes durable.

## Public page request

```mermaid
sequenceDiagram
  participant B as Browser
  participant E as Edge worker
  participant O as Origin API
  participant D as Documents
  participant R as Renderer
  B->>E: Host/path request
  E->>E: Resolve store and public route
  E->>O: Signed schema request
  O->>D: Resolve tenant content/layout
  D-->>O: Document and layout data
  O-->>E: JSON page specification
  E->>R: Apply safe segment/variant context
  R-->>B: HTML/schema response
  B->>O: Analytics and interaction events
```

## CMS authoring and publishing

```mermaid
flowchart LR
  user[Editor or agent] --> scope[Identity, tenant, folder scope]
  scope --> type[Content type/schema]
  type --> draft[Draft entry/layout/spec]
  draft --> review[Human review and validation]
  review --> publish[Publish permission]
  publish --> version[Published document/version]
  version --> edge[Edge schema/render path]
  draft --> collab[Collaboration and presence]
  collab --> review
```

The agent may draft or propose. It does not bypass scope or publish permission.

## Durable workflow and provider event

```mermaid
flowchart LR
  action[UI action] --> cap[Generic capability route]
  cap --> validate[Auth, tenant, trusted validation]
  validate --> idem[Durable idempotency]
  idem --> provider[Nango/provider effect]
  provider --> receipt[Provider event receipt]
  receipt --> queue[BullMQ]
  queue --> worker[Worker normalization]
  worker --> machine[XState transition]
  machine --> state[Persist state/context]
  machine --> evidence[Evidence projection]
  state --> result[UI/result]
  evidence --> result
```

## Analytics and agent optimization

```mermaid
flowchart LR
  product[Web, edge, future mobile] --> ingest[Analytics ingest]
  ingest --> ch[(ClickHouse)]
  product --> replay[Replay chunks]
  replay --> blob[(Object storage)]
  ch --> query[Scoped analytics query]
  blob --> query
  query --> insight[Agent insight/tool]
  insight --> proposal[Spec/layout/content proposal]
  proposal --> review[User review and approval]
  review --> runtime[Platform runtime]
  runtime --> product
```

ClickHouse is appropriate for append-heavy, high-volume analytical queries. It is not the source of truth for permissions, orders, machine state, or published content.

## Status and control events

Every important asynchronous path should make its state visible:

```text
requested
  → accepted
  → running
  → completed
  → failed/retryable
  → reviewed/applied where human approval is required
```

Agent tasks, provider receipts, machine instances, content drafts, and analytics jobs should not be represented as an unexplained spinner in the UI.

## Related

- [Control planes](./control-planes)
- [CMS and content platform](../concepts/cms-content-platform)
- [Analytics and agent operations](../concepts/analytics-observability-agents)
