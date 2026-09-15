---
title: Workers, edge, and deployment
sidebar_position: 8
status: current-and-evolving
owner: workers
last_verified: 2026-09-14
audience: [contributor, operator, architect]
---

# Workers, edge, and deployment

Workers provide the public edge boundary and asynchronous delivery paths around the origin API.

## Responsibilities

```text
edge worker
  public route gate
  host/store resolution
  signed origin proxy
  storefront schema fetch
  personalization context
  bot/SEO rendering

origin API
  identity and tenant enforcement
  domain services
  machines and capabilities
  persistence and Evidence

background worker
  provider receipts
  BullMQ event processing
  normalized machine events
```

## Local development model

The local stack should make the edge and origin boundary observable. When a feature works only by calling the origin directly, it has not proved the public runtime path.

Use the repository's normal infrastructure and development commands, then verify through the same host/path shape a browser uses.

## Source areas

```text
packages/workers/src/routes
packages/workers/src/renderer.ts
packages/workers/src/hmac.ts
packages/server/src/bootstrap.ts
packages/server/src/shared/org.ts
packages/server/src/domains/integrations
packages/server/src/domains/edge
```

## Deployment concerns

- Keep worker and origin secrets synchronized.
- Preserve HMAC/signature contract across deployments.
- Configure public host/store routing explicitly.
- Keep asynchronous receipts durable before processing.
- Verify real public webhook delivery separately from local signed callback tests.
- Build the affected edge and web artifacts before claiming a live update.

## Related

- [Run the local stack](../operations/local-stack)
- [Edge and personalization](./edge-and-personalization)
- [End-to-end runtime map](../architecture/end-to-end-runtime)
