# Architecture Patterns — Audit & Standardization

> **Date:** 2026-07-31  
> **Related:** [`ARCHITECTURE-MAP.md`](../2026-07-25/ARCHITECTURE-MAP.md) · [`DOMAIN-CLEANUP-AUDIT.md`](./DOMAIN-CLEANUP-AUDIT.md) · [`SHARED-PACKAGES.md`](./SHARED-PACKAGES.md) · [`ERROR-HANDLING.md`](./ERROR-HANDLING.md) · [`archive/2026-07-31/ARCHITECTURE-FIXED.md`](../archive/2026-07-31/ARCHITECTURE-FIXED.md)

---

## Current shape (one paragraph)

pnpm monorepo: **`@noname/server`** (Hono monolith) is the system of record; **`@noname/client`** and **`@noname/workers`** call it over HTTP; **`@noname/auth`** is the only cross-runtime shared library. Server boot (`packages/server/src/index.ts`) wires domains manually — **documents** is built first and acts as the hub (CMS, tenant settings, assets); auth, edge, and tenant consume slices of it via **`documents/contracts.ts`**. Cross-cutting code lives in `packages/server/src/shared/` (org HMAC, `respond.ts`, `parse-body.ts`, `bullmq-queue.ts`, event-bus, Redis, domain errors). Permission checks live in **`domains/auth/deny-unless.ts`**. Edge merges layout + content + flags into a resolved spec; client renders via json-render + extension catalog.

---

## What’s already good (don’t churn)

- `createXDomain(deps) → { routes, service, … }` factory pattern
- Recent domain splits: `*-guards.ts`, `*-validation.ts`, `fromDTO`, `flushEvents` (documents, flags, agent)
- Central errors: `domain-error.ts` + `app.onError` + `shared/respond.ts` + `parse-body.ts`
- **Auth API aligned** — no route-level try/catch; services/adapters throw typed domain errors
- **Cross-domain imports** — auth/edge/tenant/analytics import `documents/contracts.ts` only
- **Event constants** — `machines/events.ts`, `context/events.ts`, `flags/listeners.ts`; layout variants use `flushEvents`
- **Shared BullMQ** — `shared/bullmq-queue.ts`; domain `queue.ts` files are thin wrappers
- **`denyUnless`** — lives in auth domain (no shared → auth inversion)
- Workers stay thin (proxy + slug resolve)
- Edge as read orchestrator (no entity layer needed)
- `@noname/auth` bar for new shared packages — see `SHARED-PACKAGES.md`

---

## Inconsistencies (ranked — open only)

| # | Issue | Impact |
|---|---|---|
| 1 | **`service` vs `engine` vs `pipeline` naming** — same role, three names (machines, context, ai-pipeline outliers) | Cognitive load when navigating |
| 2 | **Auth mounted on `/api/tenants`** — identity routes live under tenant prefix | Confusing URLs for client/workers |
| 3 | **Client admin split** — API clients in `admin/`, UI still in `core/components/` | Hard to find “admin” code |
| 4 | **Store-slug triplicated** — server, client, workers | Documented defer in `SHARED-PACKAGES.md` |
| 5 | **Edge/context runtime routes** — HMAC-gated via `orgMiddleware`, not JWT `denyUnless` | By design for worker path; document when adding admin-only context routes |
| 6 | **Typed event-bus map** — event names still stringly in documents/agent analytics subscriptions | Phase 2 when touching listeners |

---

## Target patterns (standardize on these)

### 1. Domain folder skeleton

```
domains/{name}/
  index.ts       → create{Name}Domain(deps)
  api.ts         → thin routes: denyUnless, parseBody, ok/created, throw (no try/catch)
  ports.ts       → DTOs + interfaces
  service.ts     → domain logic (use engine.ts ONLY for machines/XState)
  adapters/      → postgres, redis, …
  events.ts      → if domain publishes events (constants)
  entity.ts      → if mutable lifecycle + domain events
  {name}-guards.ts
  {name}-validation.ts   → optional
  worker.ts + queue.ts   → optional async jobs
  listeners.ts   → optional event subscriptions (registered from index)
```

### 2. Mutation domains (flags, agent, documents content/layout)

1. Entity extends `AggregateRoot`
2. `static fromDTO(dto)` for update/archive
3. `{name}-guards.ts` — `require*()` throws `NotFoundError`
4. Persist → **`flushEvents(entity)` only** — no direct `eventBus.publish` in services
5. `events.ts` exports constants; subscribers import from publishers

**Skip entity/events for:** edge, ai-pipeline (orchestration), tenant catalog (mostly CRUD manifest).

**Orchestration domains** (machines, context) may publish via `eventBus` using `events.ts` constants — no entity layer required.

### 3. Cross-domain imports

- Import **documents only via `documents/contracts.ts`**
- Never import `./services/*` or `./adapters/*` from another domain
- R2/replay helpers: exported from `contracts.ts` ✅

### 4. Cross-boundary errors

| Surface | Location | Use for |
|---|---|---|
| **Types & services** | `documents/contracts.ts` | DTOs, service interfaces, pure helpers |
| **Failure modes** | `shared/domain-error.ts` | Expected failures any domain may throw |

Routes never catch domain errors — `app.onError` → `handleDomainError` maps once.

### 5. HTTP layer (see `ERROR-HANDLING.md`)

```typescript
const denied = await denyUnless(c, PERMISSIONS.X);
if (denied) return denied;
return ok(c, await service.doThing(getOrgId(c), body));
```

Import `denyUnless` from `domains/auth/deny-unless.ts` (or `domains/auth` barrel).

**Permission coverage:**

| Route group | Guard |
|---|---|
| documents, flags, agent, machines, tenant, analytics | JWT + `denyUnless` |
| ai-pipeline `/generate/*` | `AGENT_MANAGE` |
| context `GET /segments` | `TENANT_MANAGE` |
| context `/resolve`, `/segment-from-request`, edge | Edge HMAC (`orgMiddleware`) |
| auth login/register/OAuth | Public (Zod + domain errors) |

### 6. Client layout (target)

| Folder | Role |
|---|---|
| `platform/` | Runtime shell, catalog, navigation |
| `admin/api/` | Admin HTTP (`apiFetch` only) |
| `admin/components/` | Admin React UI (move from `core/components/*Admin*`) |
| `auth/` | Session, OAuth, org resolution — **`account-flows.ts` uses `apiFetch`** ✅ |
| `core/actions/` | Spec action handlers |
| `lib/` | `api.ts`, shared utils |

### 7. Shared infrastructure

- **Queues:** `shared/bullmq-queue.ts` factory ✅
- **Permissions:** `domains/auth/deny-unless.ts` ✅
- **Events:** typed `DomainEventMap` on `event-bus.ts` (phase 2)

---

## Dependency map

```
Client / Workers ──HTTP──► Server
                              │
                    ┌─────────┴─────────┐
                    │     documents      │  ← hub (CMS, tenant, assets)
                    └─────────┬─────────┘
                              │ contracts.ts
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
           auth            edge           tenant
              │               │
              └───────► analytics ◄── events (flags, agent, machines, …)

Cross-cutting: shared/domain-error.ts  ← all domains throw here
               domains/auth/deny-unless.ts  ← JWT permission gate
```

---

## Recommendations by effort

### Quick wins — done ✅

See [`archive/2026-07-31/ARCHITECTURE-FIXED.md`](../archive/2026-07-31/ARCHITECTURE-FIXED.md).

### Medium (~1 week) — open

| Action | Files |
|---|---|
| Split god APIs into `routes/*.ts` | `auth/api.ts`, `documents/api.ts`, `analytics/api.ts` |
| Consolidate client admin UI under `admin/components/` | Move from `core/components/` |
| OTEL + queue enqueue helper (agent + tenant) | Shared helper |
| Typed event-bus map (phase 2) | `shared/event-bus.ts` + documents/agent event imports in analytics |
| Rename `engine`/`pipeline` → `service` | machines, context, ai-pipeline (optional; high churn) |

### Defer

| Item | Why |
|---|---|
| `@noname/documents-shared` | `SHARED-PACKAGES.md` |
| Store-slug shared util | Stable, 3 copies |
| God-component splits (`ContentEntryAdmin`, `LoginForm`) | UI refactor, not structure |
| Auth mount `/api/auth` vs `/api/tenants` | URL migration — do with next auth feature |
| Microservices / new packages | Monolith wiring is fine |
| Result/Either per use case | Throw + central handler is simpler for Hono |

---

## Highest leverage (remaining)

1. **Client admin folder consolidation** — move `*Admin*` components under `admin/components/`.
2. **Typed event-bus map** — import event constants in analytics listeners for documents/agent too.
3. **Split god APIs** when next touching auth/documents/analytics routes.

Do **not** add packages or split services until the above patterns are consistent.
