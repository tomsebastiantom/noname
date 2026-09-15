---
title: Platform capability map
sidebar_position: 7
status: current-and-evolving
owner: platform
last_verified: 2026-09-14
audience: [agent, contributor, architect]
---

# Platform capability map

This map shows what the reusable platform provides before a vertical adds business meaning.

| Capability | Purpose | Current source |
|---|---|---|
| Identity | OIDC actors, organizations, roles | `packages/auth`, `packages/server/src/domains/auth` |
| Documents | Content types, entries, rich text, references | `packages/documents`, `packages/server/src/domains/documents` |
| Layouts | Declarative page composition | `packages/client/src/editor`, documents domain |
| Rendering | JSON spec to registered UI | `packages/client/src/catalog.ts`, `@json-render/*` |
| Visual editor | Canvas, layers, props, drafts, collaboration | `packages/client/src/editor` |
| Machines | Durable state and XState transitions | `packages/server/src/domains/machines` |
| Capabilities | Idempotent server execution boundaries | `packages/server/src/domains/capabilities` |
| Integrations | Provider credentials and callbacks | `packages/server/src/domains/integrations`, Nango |
| Workers | Edge routing and async processing | `packages/workers` |
| Analytics | Events, ClickHouse, replay | `packages/server/src/domains/analytics` |
| Agent runtime | Agent registry, tools, tasks, review | `packages/server/src/domains/agent`, `ai-pipeline` |
| Evidence | Immutable records and provenance links | `packages/server/src/domains/evidence` |
| Extensions | Domain-owned UI and actions | `packages/extensions` |

## Vertical contract

A vertical should compose these capabilities instead of reimplementing them. Commerce is the current example:

```text
platform primitives
  → Commerce capabilities and projection
  → Commerce extension UI/actions
  → provider adapter and Evidence
```

- [Building an application](./building-an-application)
- [Package boundaries](./package-boundaries)
- [The CMS and content platform](../concepts/cms-content-platform)
