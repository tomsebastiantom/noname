---
title: Machines API
sidebar_position: 2
status: current
owner: server/machines
last_verified: 2026-09-14
source_paths:
  - packages/server/src/domains/machines
---

# Machines API

The machine API loads normalized JSON definitions, executes XState transitions through ephemeral actors, and persists the resulting state and context.

## Contract principle

```text
persisted currentState/context
  → actor created for request
  → XState transition
  → persisted next currentState/context
```

The exact route request and response schema should be generated from the current server route definitions. Do not infer a new contract from this conceptual page.

## Related

- [Machines and XState](../../concepts/machines-and-xstate)
- `packages/server/src/domains/machines/engine.ts`
