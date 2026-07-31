# Architecture patterns — fixed (2026-07-31)

Items from [`ARCHITECTURE-PATTERNS.md`](../../2026-07-31/ARCHITECTURE-PATTERNS.md) quick wins and ranked inconsistencies, completed in this batch.

## Documents hub boundary

- Cross-domain imports now use `documents/contracts.ts` (auth, edge, tenant, analytics).
- R2 helpers exported via contracts for tenant/analytics.

## Events & mutation pattern

- `machines/events.ts` — engine publishes via constants; analytics imports them.
- `context/events.ts` — segment resolution event constant.
- `flags/listeners.ts` — SSE subscriptions moved out of `flags/index.ts`.
- `layouts.service.ts` — `addVariant` uses entity + `flushEvents` (no direct `eventBus.publish`).

## Auth & HTTP

- `domains/auth/deny-unless.ts` — moved from `shared/`; all domain APIs import from auth.
- Auth API: typed domain errors, no route try/catch (prior session).
- `ai-pipeline/api.ts`: `AGENT_MANAGE` on all generate routes.
- `context/api.ts`: `TENANT_MANAGE` on `GET /segments`.

## Shared infrastructure

- `shared/bullmq-queue.ts` — factory; agent/tenant/analytics `queue.ts` slimmed.

## Client

- `auth/account-flows.ts` — uses `apiFetch` / `apiFetchData` / `apiFetchVoid`.

## Typed event bus (phase 2)

- `packages/server/src/domain-events.ts` — `DomainEventName`, `DomainEventMap`, `ALL_DOMAIN_EVENTS`.
- `shared/event-bus.ts` — typed publish/subscribe signatures.
- `analytics/listeners.ts` — subscribes via `ALL_DOMAIN_EVENTS` (no string literals).

## God API splits

- **auth** — `routes/{schemas,deps,config,oauth,login,mfa,account,session,team}.ts`
- **documents** — `routes/{deps,helpers,content-types,tenant-settings,assets,layout,pages,refs,content}.ts`
- **analytics** — `routes/{deps,ingest,query,replay}.ts`
- Each `api.ts` is a thin mount assembler (~20 lines).
