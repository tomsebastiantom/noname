---
title: Admin, editor, and builder surfaces
sidebar_position: 5
status: current-and-evolving
owner: client
last_verified: 2026-09-14
audience: [builder, contributor, architect]
---

# Admin, editor, and builder surfaces

Noname has two connected control surfaces: an admin/content surface for managing the platform and a visual builder for shaping the product experience.

## Admin surface

The admin surface exposes tenant-scoped platform controls such as:

- content and folders
- users, teams, and permissions
- agents and tasks
- catalog and extension configuration
- analytics/replay views
- integrations and operational settings

## Visual builder

The builder keeps the rendered page visible while a user edits the underlying document/layout/specification.

```text
page preview
  ↔ layer tree
  ↔ component palette
  ↔ schema-backed props
  ↔ agent panel
  ↔ collaboration presence
  ↔ draft/save/review state
```

## Why these surfaces matter

The platform is not only an API runtime. People need to understand and control what the platform is doing. Agents should work inside these surfaces or return to them with a reviewable proposal.

## Current source areas

```text
packages/client/src/admin
packages/client/src/editor
packages/client/src/platform-routes.ts
packages/client/src/auth/admin-routes.ts
packages/client/src/editor/components/agent
```

## Related

- [The CMS and content platform](./cms-content-platform)
- [The visual builder](./visual-builder)
- [How people and agents build together](./human-agent-loop)
