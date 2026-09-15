---
title: Edge delivery and personalization
sidebar_position: 7
status: current
owner: workers
last_verified: 2026-09-14
audience: [contributor, architect, operator]
---

# Edge delivery and personalization

The edge worker makes public storefront delivery fast and tenant-aware while keeping durable business behavior at the origin.

## Request model

```text
request host/path
  → resolve public store
  → classify public route
  → attach signed tenant context
  → fetch schema/content from origin
  → derive cacheable visitor context
  → apply safe variant/personalization
  → render or return response
```

## Current source areas

```text
packages/workers/src/renderer.ts
packages/workers/src/routes/storefront.ts
packages/workers/src/routes/public-routes.ts
packages/workers/src/routes/resolve-proxy-org.ts
packages/server/src/domains/context
packages/server/src/domains/edge
packages/client/src/platform/browser-observability.ts
```

## Personalization boundary

Personalization should be deterministic, explainable, and safe to cache. It can choose a layout/schema variant or seed client flags, but it must not replace origin authorization or mutate durable business state.

```text
edge context
  → segment/variant decision
  → schema/layout response
  → browser observation and refresh when needed
```

## SEO and bot rendering

Bot requests can use the edge-compatible renderer to produce an escaped, streaming SEO document. This is a delivery concern; the source of truth remains the resolved page/schema.

Relevant source:

```text
packages/workers/src/routes/bot-ssr.ts
packages/workers/src/renderer.ts
```

## Failure boundaries

- Unknown host/store must not resolve another tenant.
- Public routes must be explicitly allowlisted.
- Origin calls must carry the expected edge signature.
- Client-provided organization values must not override edge-resolved context.
- Personalization failure should fall back to the default schema.

## Related

- [End-to-end runtime map](../architecture/end-to-end-runtime)
- [Workers and deployment](./workers-and-deployment)
- [Tenant identity](./system-overview)
