---
title: Seeding and fixtures
sidebar_position: 5
status: current
owner: seeding
last_verified: 2026-09-14
audience: [developer, qa]
---

# Seeding and fixtures

Seeding creates deterministic environments. Fixtures provide pure reusable data. Domain-specific test doubles remain close to the domain that owns them.

## Boundaries

```text
packages/seeding
  CLI, profiles, orchestration, environment workflows

packages/fixtures
  pure shared data and builders

domain-local __fixtures__
  domain-specific mocks and test doubles
```

## Profiles

- `platform` — platform identity, documents, layouts, and authorization
- `commerce` — Commerce catalog and deterministic order/payment evidence
- `full` — platform followed by Commerce in dependency order

## Commands

```bash
pnpm seed:demo
pnpm seed:demo:commerce
pnpm seed:demo:full
```

## Why fixtures are separate

Server behavior tests should not import seed-profile implementation data. Shared fixture data belongs in `packages/fixtures`; seed orchestration belongs in `packages/seeding`.

- [Seed demo environment](../how-to/seed-a-commerce-demo)
- [Seed profiles reference](../reference/seed-profiles)
