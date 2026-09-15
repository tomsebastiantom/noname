---
title: Machines and XState
sidebar_position: 3
status: current
owner: server/machines
last_verified: 2026-09-14
audience: [developer, architect]
---

# Machines and XState

Noname machine definitions are JSON-compatible data. XState is the sole transition authority.

## Runtime model

```text
request
  → load persisted currentState/context
  → normalize machine definition
  → create ephemeral actor
  → execute transition
  → persist next state/context
```

Actors are ephemeral per request. Durable state is the persisted machine state and context, not an in-memory actor.

## Why this matters

- Reloading a machine resumes from persisted state.
- Guards and transitions have one execution authority.
- Definitions can be stored, validated, and seeded as data.
- Tests can verify transition behavior independently of HTTP.

## Related

- [System overview](./system-overview)
- [Verify a checkout](../operations/verify-a-checkout)
- [Machines API reference](../reference/api/machines)
