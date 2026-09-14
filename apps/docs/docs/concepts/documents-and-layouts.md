---
title: Documents and layouts
sidebar_position: 2
status: current
owner: documents
last_verified: 2026-09-14
audience: [developer, extension-author]
---

# Documents and layouts

Documents are the platform's content and page composition boundary. Layout specifications describe what the client renders without placing domain-specific business rules in the generic shell.

## Model

```text
tenant
  → document/page
  → layout specification
  → catalog-resolved components
  → client renderer
```

## Responsibilities

The Documents domain owns persistence and document access. The client owns generic rendering and editing. An extension owns the component and action behavior it registers.

## Why this boundary matters

A Commerce component can be added to a layout without making the platform client understand Commerce order semantics. The same document/render pipeline can serve other verticals.

## Related

- [System overview](./system-overview)
- [Create an extension](../how-to/create-an-extension)
- [Package boundaries](../architecture/package-boundaries)
