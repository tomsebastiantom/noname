---
title: ADR-0007 — Seeding and fixture boundaries
sidebar_position: 5
status: accepted
owner: testing
last_verified: 2026-09-14
source_documents:
  - docs/2026-09-14/SEEDING-ARCHITECTURE-IMPLEMENTATION.md
  - docs/2026-09-14/TEST-FIXTURE-ARCHITECTURE-ANALYSIS.md
implementation_evidence:
  - packages/seeding
  - packages/fixtures
---

# ADR-0007: Seeding and fixture boundaries

- **Status:** accepted
- **Date:** 2026-09-14

## Context

Environment seeding and behavioral tests need reusable data without coupling server tests to seed-profile orchestration.

## Decision

`packages/seeding` owns CLI profiles and environment workflows. `packages/fixtures` owns pure shared data/builders. Domain-specific mocks remain close to their domain.

## Consequences

- Seed profiles can be run independently or in dependency order.
- Tests import neutral fixture data instead of seed implementation.
- Domain-specific test doubles remain easy to understand.

## Evidence

- `packages/seeding/src/profiles`
- `packages/fixtures/src`
- `packages/server/src/domains/notifications/*.test.ts`
