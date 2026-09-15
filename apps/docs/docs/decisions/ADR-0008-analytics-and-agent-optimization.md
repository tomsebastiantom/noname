---
title: ADR-0008 — Analytics informs agent proposals, not silent changes
sidebar_position: 8
status: proposed
owner: analytics and agent
recorded: 2026-09-14
last_verified: 2026-09-14
---

# ADR-0008: Analytics informs agent proposals, not silent changes

- **Status:** proposed
- **Date:** 2026-09-14

## Context

Noname has analytics, replay, agent tools, declarative layouts, and a reviewable editor. Together they can support a product loop where an agent analyzes behavior and proposes improvements.

## Decision proposal

Analytics and observability may inform agent recommendations for content, layout, variants, and operational work. Consequential changes remain reviewable and attributable to a person or authorized automation policy.

```text
observe
  → analyze
  → recommend
  → review
  → apply a spec/config change
  → observe again
```

## Non-goals

- No silent production optimization by default.
- Analytics does not become the source of truth for orders or permissions.
- Replay data is not available to every agent.
- The model does not bypass capability, tenant, or publish guards.

## Evidence and open work

Current foundations:

```text
packages/server/src/domains/analytics
packages/server/src/domains/agent/tools.ts
packages/client/src/editor/agent
packages/client/src/editor/lib/spec-utils.ts
```

Open work includes policy design, experiment management, approval UX, attribution, rollback, and cross-surface optimization contracts.

## Revisit conditions

Accept this ADR only after the review workflow, permissions, audit trail, and rollback behavior are implemented and verified.
