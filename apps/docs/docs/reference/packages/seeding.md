---
title: Seeding package
sidebar_position: 1
status: current
owner: seeding
last_verified: 2026-09-14
source_paths:
  - packages/seeding
---

# Seeding package

Package: `@noname/seeding`

## Profiles

```text
platform
commerce
full
```

## CLI

```bash
pnpm seed:demo
pnpm seed:demo:commerce
pnpm seed:demo:full
```

The package owns orchestration, profile context, environment workflows, and idempotent seed steps. Pure shared data belongs in `@noname/fixtures`.
