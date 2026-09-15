---
title: Create an extension
sidebar_position: 2
status: current
owner: extensions
last_verified: 2026-09-14
audience: [extension-author]
---

# Create an extension

> **How-to guide** · Start from an existing vertical or extension example.

## Goal

Add domain-owned components, actions, schemas, and routes without placing vertical semantics in the generic platform shell.

## Ownership rule

Use the platform client for generic shell, route, permission, and catalog integration. Put domain behavior in a vertical and domain UI/actions in its extension.

```text
packages/verticals/src/<vertical>
  business capabilities and provider-neutral semantics

packages/extensions/src/<vertical>
  components, actions, catalog schemas, and UI
```

## Steps

1. Choose the owning vertical.
2. Add or extend the vertical capability and schemas.
3. Register the extension component and actions.
4. Add focused tests for the capability and UI contract.
5. Add seed data only through `packages/seeding` profiles.
6. Verify the extension through the admin or storefront flow.

## Verify

Run the relevant package checks:

```bash
pnpm exec biome check .
pnpm test
```

## Related concepts

- [Package boundaries](../architecture/package-boundaries)
- [Extension lifecycle](../architecture/extension-lifecycle)
- [Commerce ownership ADR](../decisions/ADR-0010-commerce-ui-ownership)
