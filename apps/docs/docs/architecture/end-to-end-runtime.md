---
title: End-to-end runtime map
sidebar_position: 3
status: current
owner: platform
last_verified: 2026-09-14
audience: [agent, contributor, architect]
---

# End-to-end runtime map

Use this page to trace a request from a browser to a durable result.

## Public storefront request

```text
browser / browser SDK
  → edge worker public-route gate
  → tenant/store resolution from host or path
  → signed edge-to-origin request
  → server generic route
  → domain service or edge schema resolver
  → response
```

Relevant source areas:

```text
packages/workers/src/routes/public-routes.ts
packages/workers/src/routes/proxy.ts
packages/workers/src/routes/storefront.ts
packages/workers/src/resolve-slug.ts
packages/server/src/domains/edge
packages/server/src/shared/org.ts
```

## Dynamic page rendering

```text
storefront URL
  → workers renderer
  → /api/edge/schema/:siteId
  → tenant/layout/content resolution
  → optional segment/personalization context
  → JSON schema response
  → client page loader
  → catalog component renderer
```

Relevant source areas:

```text
packages/workers/src/renderer.ts
packages/client/src/platform/use-app-page-loader.ts
packages/client/src/editor/catalog-schemas.ts
packages/client/src/editor/lib/spec-utils.ts
```

## Durable behavior

```text
user action
  → client action or generic capability route
  → server authentication and tenant boundary
  → trusted validation/pricing
  → machine transition or provider effect
  → persistence/receipt/idempotency
  → worker event processing when asynchronous
  → normalized result
  → UI refresh and optional Evidence projection
```

## Edge versus origin

The edge is optimized for public delivery, routing, caching, rendering, and request normalization. The origin owns durable domain behavior, authorization, persistence, and business meaning.

Never move a tenant or permission decision into the browser merely because the edge already resolved a public host. The origin verifies the signed edge context.

## Agent tracing checklist

When debugging a feature, follow:

1. Browser component or action.
2. Network route and request shape.
3. Edge public-route and proxy behavior.
4. Origin route and middleware.
5. Domain service or machine.
6. Persistence/event/worker path.
7. Response and client refresh.
8. Evidence or analytics output if applicable.

## Related

- [Building an application](./building-an-application)
- [Edge and personalization](../concepts/edge-and-personalization)
- [Workers and deployment](../concepts/workers-and-deployment)
