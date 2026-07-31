# Architecture Patterns — Audit & Standardization

> **Date:** 2026-07-31  
> **Related:** [`ARCHITECTURE-AUDIT.md`](./ARCHITECTURE-AUDIT.md) · [`ARCHITECTURE-MAP.md`](../2026-07-25/ARCHITECTURE-MAP.md) · [`SHARED-PACKAGES.md`](./SHARED-PACKAGES.md) · [`archive/2026-07-31/ARCHITECTURE-FIXED.md`](../archive/2026-07-31/ARCHITECTURE-FIXED.md)

---

## Current shape (one paragraph)

pnpm monorepo: **`@noname/server`** (Hono monolith) is the system of record; **`@noname/client`** and **`@noname/workers`** call it over HTTP; **`@noname/auth`**, **`@noname/documents`**, and **`@noname/shared`** are cross-runtime libraries. Server boot wires domains manually — **documents** is the hub via **`documents/contracts.ts`**. Cross-cutting code lives in `packages/server/src/shared/`. **`domain-events.ts`** + `ALL_DOMAIN_EVENTS` feed analytics. Auth at **`/api/auth/:orgId/*`**; tenant catalog at **`/api/tenants/:id/*`**.

**Full good/bad pattern audit:** [`ARCHITECTURE-AUDIT.md`](./ARCHITECTURE-AUDIT.md)

---

## What's already good (don't churn)

- `createXDomain(deps) → { routes, service, … }` factory pattern
- **`api.ts` + `routes/*.ts`** — all major domains except edge (34-line inline file)
- **`domain-events.ts`** — `DomainEventName`, `ALL_DOMAIN_EVENTS`; all CMS event namespaces wired
- **`flushEvents`** for aggregates; **`eventBus.publish`** for services and runtime paths
- **`denyUnless`** + `documents/contracts.ts` cross-domain imports
- Client: **`admin/registry.ts`**, **`admin/catalog-schemas.ts`**, catalog actions for mutations
- Packages: **`@noname/shared`**, **`@noname/documents`**, **`@noname/auth`** with clear roles
- OTEL trace propagation (edge proxy, queue enqueue, analytics worker)

---

## Open inconsistencies (see audit for detail)

| # | Issue | Priority |
|---|---|---|
| 1 | Client admin **reads** bypass catalog actions (CMS, layout, auth settings) | P1 |
| 2 | Client **`canDraft` / PERMISSIONS** drift vs `@noname/auth` | P1 |
| 3 | **`FieldDefinition`** in server ports vs wire schema in `@noname/documents` | P1 |
| 4 | Unwired **`editor/`** folder duplicates field widgets | P2 |
| 5 | **`admin/catalog-schemas.ts`** single large file | P2 |
| 6 | **`parseBody`** only in auth routes | P2 (OK for now) |

---

## Target patterns

See [`ARCHITECTURE-AUDIT.md`](./ARCHITECTURE-AUDIT.md) for domain skeleton, event styles, test conventions, and anti-patterns.

### Domain folder skeleton

```
domains/{name}/
  index.ts       → create{Name}Domain(deps)
  api.ts         → mounts routes/*.ts (thin assembler)
  routes/*.ts    → denyUnless, parseBody (auth only today), ok/created
  ports.ts       → DTOs + interfaces
  service.ts     → domain logic (engine.ts ONLY for machines/XState)
  events.ts      → event name constants
  entity.ts      → if mutable lifecycle + domain events
```

### Events (two styles)

1. **`flushEvents(entity)`** — content, layout, flags CRUD, agent tasks (after persist)
2. **`eventBus.publish`** — pages, assets, content-types, tenant-settings, machines, context, flags evaluation

Do not add wrapper helpers around `eventBus.publish`.

All analytics-bound payloads include **`orgId`**.

---

## Completed (2026-07-31 sprint)

| Action | Notes |
|---|---|
| Client admin under `admin/components/` + registry/schemas split | |
| Auth mount `/api/auth/:orgId/*` | |
| Content event `orgId` + phantom events trimmed | |
| `@noname/shared` (coerceScalarString, storeSlug) | |
| `@noname/documents` (refs, locale, schema types) | |
| Domain route splits (flags, context, agent, tenant, machines, ai-pipeline) | |
| Reserved document events wired | |
| Client catalog actions (flags, content create/delete, logout) | |
| Edge trace forwarding + analytics worker OTEL | |

---

## Defer

| Item | Why |
|---|---|
| Per-event payload typing on event bus | No consumer needs it |
| `@noname/documents` in workers | No edge CMS parsing yet |
| Microservices | Monolith is fine |
