---
title: Analytics, observability, and agent operations
sidebar_position: 9
status: current-and-evolving
owner: analytics and agent
last_verified: 2026-09-14
audience: [builder, operator, agent, architect]
---

# Analytics, observability, and agent operations

Analytics and observability are platform capabilities because an AI-operated product must be measurable before an agent can safely improve it.

## Three different questions

```text
analytics       what users and products are doing
observability   whether the platform is healthy and why
agent insight   what a model infers and what it recommends
```

They should be connected, but they are not the same data set.

## Current analytics foundation

The analytics domain provides browser/event ingest, ClickHouse-backed analytics storage, replay ingest, replay session grouping, and tenant-scoped admin reads.

```text
browser SDK
  → analytics ingest
  → ClickHouse events
  → replay blob storage when applicable
  → tenant-scoped query
  → admin insight/replay surface
```

Source areas:

```text
packages/server/src/domains/analytics
packages/client/src/platform/browser-observability.ts
packages/workers/src/routes/proxy.ts
```

## Current agent foundation

Registered agents have tenant-scoped identity, permissions, tasks, tools, worker execution, and review guards. The agent tool registry includes analytics analysis capabilities.

Source areas:

```text
packages/server/src/domains/agent
packages/server/src/domains/ai-pipeline
packages/client/src/editor/agent
```

## The future optimization loop

The intended platform loop is:

```text
product/page/workflow
  → observe events, errors, performance, and outcomes
  → analytics query
  → agent analyzes evidence
  → agent proposes a change
  → human reviews scope and diff
  → platform applies a spec/layout/config change
  → experiment and observe again
```

The agent must recommend and explain before it makes consequential changes. It should not silently optimize a live store.

## What an agent may optimize

Potential controlled surfaces include:

- layout or component composition
- content presentation
- segment-specific variants
- copy or CTA experiments
- workflow friction discovered in replay
- operational alerts and runbooks

Business rules, payment behavior, permissions, and durable data changes require stronger approval and domain contracts.

## Mobile and future surfaces

The analytics contract should remain surface-neutral so web, mobile, and future clients can emit comparable events. The optimization loop should target a declarative spec or approved configuration—not a one-off React DOM mutation.

## Guardrails

- Tenant boundaries apply to analytics reads and agent tasks.
- Replay data is sensitive and requires explicit permissions.
- Agent recommendations cite the events/query window used.
- Changes are reviewable and attributable to a user/agent.
- Analytics does not become the source of truth for orders or permissions.
- Observability failures must not silently become product decisions.

- [How people and agents build together](./human-agent-loop)
- [Decision and evidence guide](../architecture/decision-and-evidence-guide)
- [Agent project orientation](../get-started/agent-project-orientation)
