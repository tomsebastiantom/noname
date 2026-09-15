---
title: ADR-0004 — Identity and tenant boundaries
sidebar_position: 4
status: accepted
owner: auth and platform
recorded: 2026-09-14
last_verified: 2026-09-14
---

# ADR-0004: Identity and tenant boundaries

- **Status:** accepted
- **Date:** 2026-09-14

## Context

Noname serves organizations, stores, users, agents, public visitors, and providers. Identity and application tenant scope must remain explicit across web, edge, API, workers, and agents.

## Decision

Use ZITADEL for OIDC identity, organizations, project roles, and JWT claims. Use Noname auth/authorization guards for application permissions, document scope, agent ownership, and tenant enforcement. The edge may resolve a public store, but the origin verifies signed tenant context.

## Consequences

- Identity provider concerns remain separate from domain authorization.
- Public host/store resolution cannot be replaced by client-supplied organization values.
- Agents receive scoped identity and permissions.
- Every domain route remains tenant-aware.

## Evidence

- `packages/auth/src/oidc`
- `packages/auth/src/jwt`
- `packages/auth/src/permissions.ts`
- `packages/server/src/shared/org.ts`
- `packages/workers/src/auth.ts`
