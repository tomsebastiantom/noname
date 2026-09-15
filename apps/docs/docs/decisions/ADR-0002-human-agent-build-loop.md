---
title: ADR-0002 — Human-directed agent build loop
sidebar_position: 2
status: proposed
owner: platform and agent
recorded: 2026-09-14
last_verified: 2026-09-14
---

# ADR-0002: Human-directed agent build loop

- **Status:** proposed
- **Date:** 2026-09-14

## Context

Agents can analyze, draft, and execute work, but a product platform must keep intent, permissions, and consequential decisions understandable to the people who own the product.

## Decision proposal

Agents operate as scoped collaborators. They can inspect allowed context, propose specs or changes, execute permitted tasks, and return evidence. People remain able to review, edit, accept, reject, and roll back meaningful changes.

```text
human intent
  → agent proposal
  → reviewable diff
  → approved platform contract
  → execution
  → result and Evidence
```

## Consequences

- Agent tasks need owner/reviewer scope.
- Editor surfaces should show proposal, diff, tools, and result.
- Analytics-driven optimization requires approval policy and rollback.
- Agents must use platform capabilities rather than bypassing domain guards.

## Evidence and open work

Current foundations include agent registry/tasks/tools, agent editor UI, task review guards, and human/agent collaboration metadata. The fully integrated page-level build surface and policy engine remain evolving.
