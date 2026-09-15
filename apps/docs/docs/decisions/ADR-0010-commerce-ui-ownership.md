---
title: ADR-0010 — Commerce UI stays in the Commerce extension
sidebar_position: 10
status: accepted
owner: commerce
recorded: 2026-09-14
last_verified: 2026-09-14
source_documents:
  - docs/2026-09-12/ORDERS-ADMIN-IMPLEMENTATION.md
implementation_evidence:
  - packages/extensions/src/commerce
---

# ADR-0010: Commerce UI stays in the Commerce extension

- **Status:** accepted
- **Date:** 2026-09-14

## Context

The platform client owns generic admin shell, routes, permissions, and catalog loading. Commerce owns Commerce semantics and presentation.

## Decision

Commerce storefront components, actions, catalog schemas, cart UI, and Orders admin UI live in `packages/extensions/src/commerce`.

## Consequences

- Commerce can evolve without adding Commerce semantics to platform core.
- Generic Evidence APIs remain reusable.
- The platform client stays vertical-neutral.

## Evidence

- `packages/extensions/src/commerce/orders-admin.tsx`
- `packages/extensions/src/commerce/orders-admin-api.ts`
- `docs/2026-09-12/ORDERS-ADMIN-IMPLEMENTATION.md`
