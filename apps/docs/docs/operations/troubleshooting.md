---
title: Troubleshooting
sidebar_position: 2
status: current
owner: platform
last_verified: 2026-09-14
audience: [contributor, operator]
---

# Troubleshooting

## The API does not respond

Confirm the local infrastructure is running and check the configured API health route. Then restart the development command:

```bash
pnpm dev
```

## The storefront has no layout

Run the platform seed profile, or use the complete profile:

```bash
pnpm seed:demo:full
```

## Commerce content is missing

Run the Commerce profile after the platform profile:

```bash
pnpm seed:demo:commerce
```

## Orders are empty

Orders are read from generic Evidence projections. Confirm that the Commerce profile has run and that the payment-success projection was created.

## Tests fail after a dependency change

Run formatting and the focused test first:

```bash
pnpm exec biome check .
pnpm test
```

Then inspect the failing package's source and test evidence rather than changing a historical document to match the failure.
