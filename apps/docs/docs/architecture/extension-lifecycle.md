---
title: Extension lifecycle
sidebar_position: 2
status: current
owner: extensions
last_verified: 2026-09-14
audience: [extension-author, architect]
---

# Extension lifecycle

An extension registers domain-owned components, actions, schemas, and routes through the platform's generic catalog and integration points.

## Lifecycle

```text
extension package
  → manifest and registration
  → catalog loading
  → route/action availability
  → layout or admin composition
  → domain-owned execution
```

## Platform responsibilities

- Load and validate extension catalog entries.
- Provide generic shell, routing, permissions, and rendering contracts.
- Keep extension loading tenant-aware.

## Extension responsibilities

- Own component and action behavior.
- Define schemas and edit metadata.
- Keep vertical semantics out of generic client code.
- Provide focused tests and seed data through the supported profile.

- [Create an extension](../how-to/create-an-extension)
- [Package boundaries](./package-boundaries)
