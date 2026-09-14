---
title: Seed profiles
sidebar_position: 4
status: current
owner: seeding
last_verified: 2026-09-14
---

# Seed profiles

| Profile | Purpose | Command |
|---|---|---|
| `platform` | Tenant, identity, layouts, documents, and platform data | `pnpm seed:demo` |
| `commerce` | Commerce catalog and deterministic order/payment evidence | `pnpm seed:demo:commerce` |
| `full` | Platform followed by Commerce | `pnpm seed:demo:full` |

Profile implementations live in `packages/seeding/src/profiles`. Pure shared fixture data lives in `packages/fixtures`.
