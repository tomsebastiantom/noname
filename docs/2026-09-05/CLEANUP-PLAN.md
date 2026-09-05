# Cleanup Plan — Before New Domain

> **Date:** 2026-09-05
> **Status:** In progress — mark each item complete as fixed
> **Rule:** Fix data-loss / 500 / mystery-400 now. God-file refactors after commerce MVP.
> **Related:** [`ADD-DOMAIN-VS-EXTENSION.md`](./ADD-DOMAIN-VS-EXTENSION.md) · [`ARCHITECTURE.md`](../2026-08-07/ARCHITECTURE.md) · [`ACTION-PLAN.md`](../2026-08-07/ACTION-PLAN.md) · [`EDGE-STOREFRONT-FIXES.md`](../2026-08-23/EDGE-STOREFRONT-FIXES.md) · [`SHARED-SECRET-STRATEGY.md`](../2026-08-23/SHARED-SECRET-STRATEGY.md)

---

## 1. Edge safety `packages/workers/src` — [ ]

- [ ] Unify HMAC: delete `renderer.ts:4-27 hmacHeaders`, reuse `hmac.ts:6-38 hmacHeaders()` + `toTenantHeaders()` adapter. Unify server `shared/org.ts:22-32` verify into one `shared/hmac.ts`.
- [ ] Merge public routes: single `PUBLIC_ROUTE {method,pattern}[]` in `public-routes.ts:3-40`. Add `GET /api/notifications/stream`, `GET /api/collab/*` ticket routes. Delete `isFlags/NotificationsStreamWithTicket` triplication in `proxy.ts:29-61`.
- [ ] Fix status masking: `proxy.ts:90-98` + `resolve-slug.ts:25` return 401 for ticket/stream/collab when `!orgId`, preserve upstream status, log slug resolve status, cache only 200.
- [ ] Harden KV: `cache.ts:5-17`, `jwks-cache.ts:39-56`, `resolve-slug.ts:16-30` — try/catch KV I/O, normalize keys, cache miss 60s, in-memory Map 30-60s + SWR, jitter TTL.
- [ ] Bot SSR: `storefront.ts:76-82`, `bot-ssr.ts:9-15`, `renderer.ts:29-44` — delete dead `renderer.isBot`, cap bot fetch 3-5s, KV 300s, `Vary: User-Agent` + `Cache-Control public,max-age=300`, fallback shell on timeout.
- [ ] Secrets sync: implement `SHARED-SECRET-STRATEGY.md` B+D — canonical `env/.env.shared` + `secrets:sync/check` + fingerprint logs, gate `workers dev` on check.

Accept: anonymous `GET /api/tenants/yogastore/catalog`, `GET /api/edge/schema/yogastore`, `GET /api/flags/public` 200; ticket mint + SSE hold; mismatched secret fails fast with file names.

---

## 2. Server safety `packages/server/src` — [ ]

- [ ] Split graphs: `bootstrap.ts:44-72` `createApp()` → `createApiGraph()` vs `createWorkerGraph()`. Separate DB pools API 20 / workers 10-30. No `app.route` in `worker.ts:30`.
- [ ] Pagination: `machines/routes/instances.ts:38`, `machines/routes/definitions.ts:16`, `context/adapters/postgres.ts:42`, `documents/adapters/postgres.ts:155-168`, `webhooks/adapters/postgres.ts:216-222` — require `shared/pagination.ts:15 parseLimitOffset 50/200`, push LIMIT/OFFSET to Drizzle.
- [ ] Indexes: `machines/schema.ts:45-81` `(orgId,machineName)`, `(instanceId)`; `ai-pipeline/schema.ts:3-12` `(orgId,created_at)`; `documents/schema.ts:67-75` `(orgId,collectionId)` + trigram/GIN for search paths in `adapters/postgres.ts:161-162,240-265`.
- [ ] N+1: `auth/scope/bindings.ts:22-27` batch Keto tuples once; `webhooks/adapters/postgres.ts:274-282` push `eventTypes @>` to SQL; replace `data::text LIKE` with FTS + limit.
- [ ] Workers: `analytics/worker.ts:17-50` remove app batching, `concurrency:1` → tuned; all workers set `lockDuration/stalledInterval/backoff/limiter`; `worker.ts:34-39` `worker.close()/queue.close()/sdk.shutdown()` on SIGTERM with drain timeout.
- [ ] Redis: `shared/event-bus.ts:31-32`, `sse-manager.ts:46-47`, `collab-relay.ts:40-41` — single shared IORedis + dedicated subscriber, await publish with timeout + degraded metric, shard by `orgId` hash.
- [ ] OTel: `tracing.ts:23-28` `parentbased_traceidratio` 0.05-0.1 prod, hash/cap prompt attrs in `ai-pipeline/service.ts:32-47`, link not child in `agent/mastra/executor.ts:46-58`.

Accept: `pnpm check + typecheck` clean; lists capped; concurrent checkout no race; SIGTERM drains without job loss.

---

## 3. Cleanliness (ports, errors, imports) — [ ]

- [ ] Canonicalize `documents/ports.ts` vs `contracts.ts` — one surface, thin re-export shim, lint-ban divergence.
- [ ] Route cross-domain via ports only: `collab/layout-room.ts:7`, `collab/r2-*.ts:10`, `documents/api.ts:2`, `auth/guards.ts:12`, `secrets/service.ts:5`, `agent/mastra/executor.ts:17-18` — inject `LayoutValidator/R2Config/AuthVerifier/WebhookVerifier` in `bootstrap.ts`, add `no-restricted-imports` for `../*/services|assets|adapters`.
- [ ] Typed errors: replace raw `throw` in `bootstrap.ts:68`, `agent/mastra/executor.ts:109,112`, `collab/*-session.ts`, `layout-collab-document-id.ts:20` with `DomainError` subclasses, fallback `code:INTERNAL` + `traceId`.
- [ ] Demo hygiene: remove `COLLAB-TEST-456me / Lol` seeds, enable `extensions: ["commerce"]` for `yogastore`.

Accept: no deep cross-domain imports; `handleDomainError` maps all known errors; live store has no test artifacts.

---

## 4. Deferred after commerce MVP — [ ]

`main.tsx:108-442` split, `use-edit-page-orchestration.ts:40-604` split, `EditorCanvas.tsx:539` remount fix, `JSON.stringify` → `diffToPatches`, zero `React.memo` pass, triple router → single `ROUTE_TABLE`, editor → admin import reversal, client `fetch` → `lib/api.ts`, TipTap/Yjs/Automerge code-split, Effect/Nest migration.

---

## Progress log

| Date | Item | Status |
|---|---|---|
| 2026-09-05 | Plan created | open |
| 2026-09-05 | 1 Edge safety batch 1-5: HMAC unify, public routes merge, 401 vs 400, KV harden, bot SSR cache | done — `tsc --noEmit` clean, 21 vitest pass |
| 2026-09-05 | Live server + browser verify | done — podman up, API :3000 ok, edge :8787 ok, flags/public 200, schema 200, browser yogastore renders with flag promo, only favicon 404 |
| 2026-09-05 | Batch 2: favicon passthrough, worker drain, pagination, indexes, N+1 | done — tsc clean, 11 vitest pass, db:push applied, live API/edge 200, browser 0 console errors |
| 2026-09-05 | Section 3a: ports canonicalization | done — types to `ports`, values stay in `contracts`, tsc clean, 14 vitest pass, live API/edge 200, browser 0 errors |
| 2026-09-05 | Shim removal (pre-prod, no back-compat) | done — contracts type re-exports + shim comment removed, tenantHmacHeaders removed, PUBLIC_*_PATTERNS removed, agent-token verify re-export removed, secrets factories required, 29 vitest pass, live commerce home renders 0 errors |
| 2026-09-05 | Section 3b-d: cross-domain ports, DomainError, commerce seed | done — shared/agent-token, validateSpec via documents index, required authorization, injected LLM factories, Validation/ServiceUnavailable/Storage errors, extensions ["commerce"] live |
