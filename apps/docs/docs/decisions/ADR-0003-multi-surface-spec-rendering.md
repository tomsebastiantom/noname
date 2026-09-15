---
title: ADR-0003 — Shared specifications across client surfaces
sidebar_position: 3
status: proposed
owner: client and platform
recorded: 2026-09-14
last_verified: 2026-09-14
---

# ADR-0003: Shared specifications across client surfaces

- **Status:** proposed
- **Date:** 2026-09-14

## Context

Noname needs web, future mobile, and other clients to express the same product intent without forcing every surface to share the same component implementation.

## Decision proposal

Keep content, layout, component schema, action, machine-event, permission, and analytics contracts surface-neutral. Each client supplies a compatible registry and native renderer.

## Consequences

- Web can use React/JSON-render while a future native client uses native components.
- Agent proposals target shared specs rather than DOM-specific patches.
- Surface-specific behavior remains possible where it is explicitly modeled.

## Current evidence and future work

Current web evidence:

- `packages/client/src/catalog.ts`
- `packages/client/src/platform/catalog.ts`
- `packages/extensions/src/commerce/registry.ts`

A native renderer, cross-surface compatibility suite, and stable public schema versioning remain future work.
