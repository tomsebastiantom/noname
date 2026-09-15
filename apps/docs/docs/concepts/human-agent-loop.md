---
title: How people and agents build together
sidebar_position: 1
status: vision-and-architecture
owner: platform
last_verified: 2026-09-14
audience: [builder, contributor, architect]
---

# How people and agents build together

Noname treats the agent as a collaborator inside a human-directed build loop. The agent can move quickly, but the person remains responsible for intent, constraints, and approval.

## The collaboration loop

```text
1. Person states the outcome
2. Agent asks for missing context
3. Agent proposes a spec, plan, or change
4. Person reviews the proposal
5. Agent implements through platform contracts
6. Platform runs and records the result
7. Person evaluates the product
8. Both iterate
```

## Responsibilities

| Person | Agent | Platform |
|---|---|---|
| Set intent and priorities | Explore possible implementations | Execute declared contracts |
| Define constraints and acceptance | Draft specs and changes | Enforce identity and permissions |
| Review behavior and tradeoffs | Explain decisions and failures | Persist state and evidence |
| Approve meaningful changes | Iterate quickly | Connect UI, machines, and integrations |

## The page-level experience

A future Noname building surface should let a person see, beside the product they are shaping:

- the current page or workflow
- the declarative spec behind it
- the agent's proposed change
- the diff and explanation
- the permissions and affected integrations
- the result and Evidence from the last run

The person should be able to accept, edit, reject, or ask the agent to try another approach without losing the product context.

## Why specifications matter

A specification is the shared language between the person, agent, and runtime:

```text
human intent
  → agent proposal
  → reviewable specification
  → UI/backend/integration execution
  → observable result
```

This keeps the agent from becoming an opaque side channel. The proposal is inspectable, the execution is bounded by platform contracts, and the result can be evaluated.

## Guardrails

- Human approval remains explicit for consequential changes.
- Tenant and permission boundaries apply to agent actions.
- Agents do not bypass generic capability contracts.
- Provider effects are durable and replay-safe.
- Product outcomes should be observable and auditable.
- The current implementation status is never inferred from a vision page.

## Current and future boundary

The repository already contains declarative documents, layouts, machines, capabilities, Evidence, editor collaboration, and extension boundaries. The fully integrated agent-in-the-building-surface experience is a product direction that will be implemented incrementally.

- [The Noname vision](./vision)
- [System overview](./system-overview)
- [Package boundaries](../architecture/package-boundaries)
- [Evidence and provenance](./evidence-and-provenance)
