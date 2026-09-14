---
title: ADR-0001 — Domain versus extension ownership
sidebar_position: 1
status: accepted
owner: architecture
last_verified: 2026-09-14
source_documents:
  - docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md
---

# ADR-0001: Domain versus extension ownership

- **Status:** accepted
- **Date:** 2026-09-14

## Context

The platform must support multiple verticals without placing every business concept in generic server or client packages.

## Decision

Generic platform behavior belongs in `packages/server` and `packages/client`. Business capabilities belong in `packages/verticals`. Domain-owned UI and actions belong in `packages/extensions`.

## Consequences

- Generic APIs remain reusable.
- Commerce does not require a Commerce branch in generic server domains.
- Extension registration is an explicit ownership boundary.

## Evidence

- `packages/verticals/src/commerce`
- `packages/extensions/src/commerce`
- `docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md`
