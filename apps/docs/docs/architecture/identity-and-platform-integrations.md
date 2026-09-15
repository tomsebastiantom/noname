---
title: Identity and platform integrations
sidebar_position: 5
status: current-and-evolving
owner: auth and platform
last_verified: 2026-09-14
audience: [agent, contributor, operator, architect]
---

# Identity and platform integrations

Noname uses specialized infrastructure for identity, authorization, storage, queues, analytics, and provider access while keeping product semantics in the platform and vertical packages.

## Identity and authorization

```text
ZITADEL
  OIDC login, users, organizations, project roles, JWT claims

Keto/authorization layer
  relationship and collection/folder scope

Noname auth domain
  actor resolution, permission laws, tenant-scoped guards
```

Relevant source areas:

```text
packages/auth/src/oidc
packages/auth/src/jwt
packages/auth/src/permissions.ts
packages/server/src/domains/auth
packages/server/src/domains/auth/scope
packages/workers/src/auth.ts
```

ZITADEL answers who the actor is and provides identity claims. Noname still enforces application tenant, document, agent, and domain permissions.

## Persistence and asynchronous work

```text
Postgres/Drizzle
  durable domain state, documents, machines, capabilities, Evidence

Redis/BullMQ
  asynchronous jobs and provider event processing

R2/object storage
  assets, replay chunks, and large blobs when configured

ClickHouse
  analytics events and query workloads
```

## External integrations

```text
Nango
  provider credentials and provider-neutral proxy boundary

Stripe Sandbox/provider adapters
  Commerce checkout and payment effects

Cloudflare Worker
  public edge routing, rendering, and personalization
```

The integration boundary is not the domain model. A provider event is normalized into a platform/domain event before it changes a machine or creates an order projection.

## Local versus production

Local development uses seeded ZITADEL, Postgres, Redis, and configured provider services. Production adds Cloudflare deployment, real public webhook delivery, managed storage, and operational secrets.

The local path is useful evidence, but a local callback is not proof of public webhook delivery.

## Agent access

Agents receive scoped identity and permissions. Agent tools call platform contracts rather than reaching into databases or provider secrets. Review guards connect agent tasks to their owner or authorized administrators.

- [Package boundaries](./package-boundaries)
- [Workers and deployment](../concepts/workers-and-deployment)
- [Analytics and agent operations](../concepts/analytics-observability-agents)
- [Decision and evidence guide](./decision-and-evidence-guide)
