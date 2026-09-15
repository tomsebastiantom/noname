---
title: ADR-0005 — XState is the transition authority
sidebar_position: 5
status: accepted
owner: server/machines
recorded: 2026-09-14
last_verified: 2026-09-14
source_documents:
  - docs/2026-09-08/XSTATE-REUSE-MIGRATION-PLAN.md
implementation_evidence:
  - packages/server/src/domains/machines/engine.ts
---

# ADR-0005: XState is the transition authority

- **Status:** accepted
- **Date:** 2026-09-14

## Context

Machine definitions need one predictable transition engine while actors remain request-scoped.

## Decision

XState owns machine transitions. The server normalizes JSON definitions, creates an ephemeral actor per request, reloads persisted state/context, executes the transition, and persists the result.

## Consequences

- Guards and transitions are not duplicated in route handlers.
- Persisted state is reloadable.
- Tests can exercise the engine independently of HTTP.

## Evidence

- `packages/server/src/domains/machines/engine.ts`
- `packages/server/src/domains/machines/engine.test.ts`
