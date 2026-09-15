---
title: Multi-surface rendering
sidebar_position: 6
status: current-and-evolving
owner: client and platform
last_verified: 2026-09-14
audience: [builder, contributor, architect]
---

# Multi-surface rendering

Noname aims to keep product intent and UI structure portable across web, native, and future surfaces.

## Shared contract

```text
content/layout/component specification
  → surface-specific catalog registry
  → renderer
  → platform actions and state
```

The specification describes intent and structure. Each client surface supplies a compatible component registry and interaction adapter.

## Current web path

The current web client uses JSON-render contracts and registered React components:

```text
JSON spec
  → @json-render/core
  → @json-render/react registry
  → client component
  → browser action/state
```

Relevant source areas:

```text
packages/client/src/catalog.ts
packages/client/src/catalog-loader.ts
packages/client/src/platform/catalog.ts
packages/extensions/src/commerce/registry.ts
packages/client/src/platform/use-app-page-loader.ts
```

## Future native path

A React Native or other client can implement the same conceptual catalog and action contracts with native components. That is a portability direction, not a claim that a native renderer is complete today.

```text
same product spec
  → web registry / native registry / future registry
  → surface-native rendering
```

## What must stay portable

- component identity and schema
- content field semantics
- action names and payload contracts
- machine events and state meaning
- permission requirements
- analytics event vocabulary

## What can vary by surface

- visual component implementation
- navigation and gesture behavior
- platform-specific capabilities
- responsive/native layout details
- storage and offline adapters

## Agent implications

An agent should propose changes to the shared spec, schema, or action contract when the change should work across surfaces. It should not silently create a browser-only implementation when the product requirement is cross-surface.

- [The visual builder](../concepts/visual-builder)
- [The CMS and content platform](../concepts/cms-content-platform)
- [How people and agents build together](../concepts/human-agent-loop)
