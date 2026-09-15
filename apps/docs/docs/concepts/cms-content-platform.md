---
title: The CMS and content platform
sidebar_position: 10
status: current-and-evolving
owner: documents
last_verified: 2026-09-14
audience: [builder, editor, contributor, architect]
---

# The CMS and content platform

Noname is not only a storefront renderer. Its Documents domain and visual editor form a multi-tenant content platform for teams to create, organize, compose, publish, and reuse content.

## Content model

```text
organization/tenant
  → folders and access scope
  → content types and schemas
  → entries and rich text
  → references and embedded assets
  → drafts and published documents
  → layouts and page composition
  → rendered web or future client surface
```

## Current content capabilities

The repository includes foundations for:

- content types and schema-backed fields
- rich text and TipTap conversion
- references and embedded entries/assets
- content search excerpts
- tenant-scoped documents and folders
- draft and publish permissions
- layout/page documents
- visual editing and collaboration
- catalog-backed components

Source areas:

```text
packages/documents/src
packages/server/src/domains/documents
packages/client/src/admin
packages/client/src/editor
packages/auth/src/permissions.ts
```

## Authoring experience

A user can work from the admin content area or visual builder:

```text
choose content/page
  → edit fields or rich text
  → compose layout
  → preview responsive result
  → collaborate with people/agents
  → save draft
  → review permissions and changes
  → publish
```

## How the agent fits

An agent can help draft content, propose a layout, find related entries, generate variants, or diagnose a page. The platform must keep the proposal bound to the tenant, content type, permission, and review workflow.

```text
agent request
  → scoped content context
  → proposed entry/layout/spec patch
  → user review
  → draft write
  → publish permission if approved
```

Agents must not bypass draft/publish boundaries.

## CMS versus Commerce

Commerce can register content types and components, but the CMS primitives remain generic. A future editorial team, marketing site, mobile app, or another vertical should be able to reuse the same content and layout foundation.

## Related

- [Documents and layouts](./documents-and-layouts)
- [The visual builder](./visual-builder)
- [Package boundaries](../architecture/package-boundaries)
- [Identity and platform integrations](../architecture/identity-and-platform-integrations)
