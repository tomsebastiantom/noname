---
title: Seed a Commerce demo environment
sidebar_position: 1
status: current
owner: seeding
last_verified: 2026-09-14
audience: [developer, ci-operator]
---

# Seed a Commerce demo environment

> **How-to guide** · 5 minutes

## Goal

Populate a running local Noname stack with platform and Commerce demonstration data.

## Choose a profile

Platform only:

```bash
pnpm seed:demo
```

Commerce only:

```bash
pnpm seed:demo:commerce
```

Everything in dependency order:

```bash
pnpm seed:demo:full
```

## Verify

Open the storefront and Orders admin:

```text
http://yogastore.localhost:5173/
http://yogastore.localhost:5173/admin/orders
```

The seed runner should report the selected profile and completed steps.

## Common failures

### API connection failed

Check that the API is running and that its configured database is available.

### Commerce catalog is missing

Run the full profile, or run the platform profile before the Commerce profile.

## Related reference

- [Seed profiles](../reference/seed-profiles)
- [Seeding concept](../concepts/seeding)
