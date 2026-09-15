---
title: Trace a feature from UI to runtime
sidebar_position: 4
status: current
owner: architecture
last_verified: 2026-09-14
audience: [agent, contributor]
---

# Trace a feature from UI to runtime

Use this when an agent or contributor needs to understand an unfamiliar feature before changing it.

## 1. Find the user entry point

Search the client/editor/extension for the visible component, action, hook, or route.

## 2. Find the request contract

Record the HTTP path or action payload. Do not infer the server behavior from the button label.

## 3. Follow the edge boundary

For public behavior, inspect route allowlisting, host/store resolution, HMAC signing, and proxy forwarding.

## 4. Follow the origin boundary

Find auth, tenant middleware, route validation, domain service, machine transition, or capability execution.

## 5. Follow durable effects

Identify persistence, idempotency, provider receipt, worker queue, Evidence, analytics, or client refresh.

## 6. Read the focused tests

Tests often provide the clearest contract. Record their path in the documentation page or change description.

## 7. Make the smallest change

Preserve generic/vertical/extension ownership. Add or update the focused test before broad refactoring.

## Example: checkout

```text
Commerce cart UI
  → generic capability route
  → trusted pricing and idempotency
  → Nango/provider checkout
  → signed callback
  → provider receipt
  → BullMQ worker
  → XState transition
  → payment/order Evidence
  → Orders admin read
```

## Verify

```bash
pnpm exec biome check .
pnpm test
pnpm build
```

For a public/edge feature, also verify through the seeded browser-facing host/path rather than only an origin URL.
