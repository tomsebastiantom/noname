---
title: ADR-0007 — Content and CMS primitives remain generic
sidebar_position: 7
status: accepted
owner: documents and platform
recorded: 2026-09-14
last_verified: 2026-09-14
---

# ADR-0007: Content and CMS primitives remain generic

- **Status:** accepted
- **Date:** 2026-09-14

## Context

Noname needs a full content platform for teams to author, organize, compose, collaborate, preview, and publish content across products and surfaces.

## Decision

Content types, entries, rich text, references, assets, folders, drafts, publishing permissions, layouts, and editor collaboration remain generic Documents/platform capabilities. Verticals register domain-specific content and components on top.

## Consequences

- Commerce can use the CMS without owning the CMS.
- A marketing site, mobile app, or future vertical can reuse content contracts.
- Agents must respect content scope and draft/publish permissions.
- The visual builder edits a document/spec contract rather than a hard-coded page.

## Evidence

- `packages/documents/src`
- `packages/server/src/domains/documents`
- `packages/client/src/editor`
- `packages/auth/src/permissions.ts`
