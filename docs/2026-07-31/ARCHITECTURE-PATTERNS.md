# Architecture Patterns — Audit & Standardization

> **Date:** 2026-07-31  
> **Related:** [`ARCHITECTURE-MAP.md`](../2026-07-25/ARCHITECTURE-MAP.md) · [`DOMAIN-CLEANUP-AUDIT.md`](./DOMAIN-CLEANUP-AUDIT.md) · [`SHARED-PACKAGES.md`](./SHARED-PACKAGES.md) · [`ERROR-HANDLING.md`](./ERROR-HANDLING.md) · [`archive/2026-07-31/ARCHITECTURE-FIXED.md`](../archive/2026-07-31/ARCHITECTURE-FIXED.md)

---

## Current shape (one paragraph)

pnpm monorepo: **`@noname/server`** (Hono monolith) is the system of record; **`@noname/client`** and **`@noname/workers`** call it over HTTP; **`@noname/auth`** and **`@noname/shared`** are cross-runtime libraries (auth/permissions; tiny pure helpers only). Server boot (`packages/server/src/index.ts`) wires domains manually — **documents** is built first and acts as the hub (CMS, tenant settings, assets); auth, edge, and tenant consume slices of it via **`documents/contracts.ts`**. Cross-cutting code lives in `packages/server/src/shared/` (org HMAC, `respond.ts`, `parse-body.ts`, `bullmq-queue.ts`, event-bus, Redis, domain errors). **`domain-events.ts`** aggregates all domain event names; analytics subscribes via `ALL_DOMAIN_EVENTS`. God APIs split into **`routes/*.ts`** (auth, documents, analytics). Permission checks live in **`domains/auth/deny-unless.ts`**. Auth routes mount at **`/api/auth/:orgId/*`**; tenant catalog at **`/api/tenants/:id/*`**.

---

## What’s already good (don’t churn)

- `createXDomain(deps) → { routes, service, … }` factory pattern
- **`api.ts` + `routes/*.ts`** — auth (config/oauth/login/mfa/account/session/team), documents (8 route modules), analytics (ingest/query/replay)
- **`domain-events.ts`** — `DomainEventName`, `ALL_DOMAIN_EVENTS`; typed event names on `eventBus.publish/subscribe`
- Recent domain splits: `*-guards.ts`, `*-validation.ts`, `fromDTO`, `flushEvents` (documents, flags, agent)
- Central errors: `domain-error.ts` + `app.onError` + `shared/respond.ts` + `parse-body.ts`
- Cross-domain imports via `documents/contracts.ts`
- Event constants per domain; analytics auto-subscribes to all
- Shared BullMQ, auth `denyUnless`, workers thin, edge as read orchestrator
- **`machines/engine.ts`** — only domain that keeps `engine` (XState runtime)

---

## Inconsistencies (ranked — open only)

| # | Issue | Impact |
|---|---|---|
| 1 | **Store-slug triplicated** | Documented defer in `SHARED-PACKAGES.md` |
| 2 | **Edge/context runtime routes** — HMAC-gated, not JWT | By design for worker path |

---

## Target patterns (standardize on these)

### 1. Domain folder skeleton

```
domains/{name}/
  index.ts       → create{Name}Domain(deps)
  api.ts         → mounts routes/*.ts (thin assembler)
  routes/*.ts    → route groups: denyUnless, parseBody, ok/created
  ports.ts       → DTOs + interfaces
  service.ts     → domain logic (use engine.ts ONLY for machines/XState)
  adapters/
  events.ts      → event name constants
  entity.ts      → if mutable lifecycle + domain events
  {name}-guards.ts
  listeners.ts   → optional SSE / event subscriptions
```

### 2. Events

- Each publishing domain exports constants in `events.ts`
- **`packages/server/src/domain-events.ts`** — union type + `ALL_DOMAIN_EVENTS` for subscribers
- **`shared/event-bus.ts`** — `publish/subscribe(event: DomainEventName | string, …)`
- Analytics: `for (const e of ALL_DOMAIN_EVENTS) eventBus.subscribe(e, …)` ✅
- Mutation domains: `flushEvents(entity)` only — no direct publish in services

### 3. Cross-domain imports

- Types/services → `documents/contracts.ts`
- Failures → `shared/domain-error.ts`

### 4. HTTP layer

Import `denyUnless` from `domains/auth/deny-unless.ts`. Route modules follow:

```typescript
export function registerXRoutes(routes: Hono, deps: XRouteDeps): void { … }

export function createXRoutes(service: XService) {
  const routes = new Hono();
  registerXRoutes(routes, { service });
  return routes;
}
```

Auth routes: **`/api/auth/:orgId/{config,login,session,users,…}`** — not under `/api/tenants`.

---

## Recommendations by effort

### Done ✅

See [`archive/2026-07-31/ARCHITECTURE-FIXED.md`](../archive/2026-07-31/ARCHITECTURE-FIXED.md), plus:

| Action | Notes |
|---|---|
| Client admin UI under `admin/components/` | 19 components moved from `core/components/` |
| OTEL queue enqueue helper | `shared/bullmq-trace.ts` — `injectTraceCarrier()` |
| Tenant catalog worker OTEL | Worker extracts trace context + `tenant.catalog.build` span |
| Auth mount `/api/auth` | Routes `/:orgId/*`; client + worker public patterns updated; docs under `docs/` swept |
| `engine`/`pipeline` → `service` | `context/service.ts`, `ContextService`; ai-pipeline exports `service`; machines keeps `engine.ts` |
| God-component splits | `ContentEntryAdmin` → type-list / create / editor; `LoginForm` → per-view components |
| Content event `orgId` | CMS events include `orgId` — analytics ingestion works |
| Phantom events trimmed | `ALL_DOMAIN_EVENTS` = publishers only; reserved names stay in `documents/events.ts` |
| `@noname/shared` | `coerceScalarString`; AI junkyard rules in `SHARED-PACKAGES.md` |
| Edge trace forwarding | Proxy forwards `traceparent` / `tracestate` to API origin |
| Analytics worker OTEL | `analytics.ingest.batch` span on batch flush |
| Domain `routes/` splits | flags, context, agent, tenant, machines, ai-pipeline — thin `api.ts` assemblers |
| Client admin catalog split | `admin/registry.ts`, `admin/catalog-schemas.ts`; actions via catalog |
| Reserved document events | content_type, asset, page, page_tree, tenant_settings wired in services |

### Defer

| Item | Why |
|---|---|
| `@noname/documents-shared` | `SHARED-PACKAGES.md` |
| Store-slug shared util | Stable, 3 copies |
| Microservices / new packages | Monolith wiring is fine |

---

## Highest leverage (remaining)

(none — see Defer for optional follow-ups)
