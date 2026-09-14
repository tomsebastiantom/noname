---
title: Run the local stack
sidebar_position: 1
status: current
owner: platform
last_verified: 2026-09-14
audience: [contributor, operator]
---

# Run the local stack

## Prerequisites

- Node.js 20+
- pnpm
- Podman and Podman Compose
- Repository dependencies installed

## Install

```bash
pnpm install
```

## Start

Start the repository's configured Postgres, Redis, and supporting services, then run:

```bash
pnpm dev
```

## Seed

```bash
pnpm seed:demo:full
```

## Verify

```bash
pnpm exec biome check .
pnpm test
pnpm build
```

Then open the seeded storefront and admin UI.

## Related

- [Local development](../get-started/local-development)
- [Seed Commerce demo](../how-to/seed-a-commerce-demo)
- [Troubleshooting](./troubleshooting)
