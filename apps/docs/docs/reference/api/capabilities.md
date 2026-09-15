---
title: Capabilities API
sidebar_position: 3
status: current
owner: server/capabilities
last_verified: 2026-09-14
source_paths:
  - packages/server/src/domains/capabilities
---

# Capabilities API

Capabilities are generic server execution boundaries. Commerce checkout is a vertical-owned capability exposed through the generic capability route.

## Contract principles

- Pricing is derived and trusted on the server.
- Capability requests support durable idempotency.
- Provider effects are separated from machine transitions.
- Results and conflicts are persisted according to the capability contract.

## Related

- [System overview](../../concepts/system-overview)
- [Verify a checkout](../../operations/verify-a-checkout)
- `packages/server/src/domains/capabilities`
