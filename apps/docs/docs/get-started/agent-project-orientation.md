---
title: Agent project orientation
sidebar_position: 3
status: current
owner: documentation
last_verified: 2026-09-14
audience: [agent, contributor]
---

# Agent project orientation

> **Start here if you are an agent or a new contributor.**

Your first job is not to edit code. Build a map of the system, identify the owning boundary, and find the evidence that proves the behavior.

## Read in this order

1. [The Noname vision](../concepts/vision)
2. [How people and agents build together](../concepts/human-agent-loop)
3. [System overview](../concepts/system-overview)
4. [Package boundaries](../architecture/package-boundaries)
5. [Building an application](../architecture/building-an-application)
6. [Current roadmap](https://github.com/tomsebastiantom/noname/blob/main/docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md)

## Repository map

```text
apps/docs
  current public documentation

packages/server
  generic API domains, persistence boundaries, machines, capabilities, Evidence

packages/client
  generic admin shell, visual editor, catalog loading, agent panel, collaboration UI

packages/verticals
  business semantics such as Commerce capabilities and order projection

packages/extensions
  domain-owned components, actions, schemas, storefront/admin UI

packages/workers
  edge proxy, public routes, schema rendering, personalization, bot SSR

packages/auth
  shared identity and permission laws

packages/seeding
  environment profiles and deterministic orchestration

packages/fixtures
  pure shared test/seed fixture data
```

## Before changing code

Answer these questions:

- What user or agent outcome is changing?
- Which package owns that meaning?
- Is the behavior generic or vertical-specific?
- Which current test proves the contract?
- Does the change affect tenant, permission, idempotency, or Evidence boundaries?
- Is an ADR needed, or is this only an implementation detail?
- Which documentation page will explain the new behavior?

## Evidence-first workflow

```text
understand request
  → map ownership
  → read source and tests
  → write or update the contract
  → implement the smallest boundary change
  → run focused tests
  → run full checks
  → update current docs and history
```

## Useful commands

```bash
pnpm exec biome check .
pnpm test
pnpm build
pnpm docs:build
```

Do not treat a historical plan or an old percentage as current status. Verify claims against source, tests, and the authoritative roadmap.
