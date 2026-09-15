---
title: Building an application on Noname
sidebar_position: 2
status: current-and-evolving
owner: platform
last_verified: 2026-09-14
audience: [builder, contributor, agent, architect]
---

# Building an application on Noname

This is the end-to-end map for building a product on the reusable platform.

## 1. Describe the product

Start with the user journey, domain objects, constraints, and acceptance criteria. Keep the first contract small and observable.

```text
user outcome
  → domain model
  → page/layout and interaction spec
  → machine states and events
  → capabilities and integrations
```

## 2. Choose ownership

Use the generic platform for shared primitives. Add domain meaning to a vertical. Add domain UI/actions to an extension.

```text
platform primitive       packages/server or packages/client
business capability      packages/verticals
product UI and actions   packages/extensions
async/provider effects   packages/workers and integrations
```

## 3. Build the experience

Documents and layout specifications drive what the client renders. The visual editor lets a user select, arrange, and edit catalog-backed components. The agent can propose changes to the same spec and explain the diff.

## 4. Build behavior

Use a machine when the behavior has durable states and transitions. Use a generic capability when a request needs an authenticated, idempotent server execution boundary. Use a provider adapter when an external system is involved.

```text
UI action
  → generic route/capability
  → trusted server validation
  → machine or provider effect
  → durable state/event
  → user-visible result
```

## 5. Add edge delivery only where needed

The edge worker resolves the public tenant/store, proxies allowed routes, renders public schema, and can apply cacheable personalization. The origin remains responsible for domain authorization and durable behavior.

## 6. Add evidence and operations

Important outcomes should be observable and, where auditability matters, represented by immutable Evidence records and typed links. Add seed steps and tests only after the runtime contract exists.

## 7. Verify the product

Verify the shortest user journey first, then failure behavior:

- anonymous and authenticated access
- tenant isolation
- replay and duplicate behavior
- persisted machine reload
- provider callback handling
- visual/editor result
- Evidence projection when applicable

## Source map

- [System overview](../concepts/system-overview)
- [Documents and layouts](../concepts/documents-and-layouts)
- [Machines and XState](../concepts/machines-and-xstate)
- [Package boundaries](./package-boundaries)
- [Extension lifecycle](./extension-lifecycle)
- [Verify a checkout](../how-to/verify-a-checkout)
