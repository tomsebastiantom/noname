# 05 — Scalability, Runtime & Security Review

**Question answered:** what breaks first as tenants and traffic grow, and what breaks in production but not on a single dev machine?

Everything here was verified by reading the code. Security findings marked **[verified statically]** were traced end-to-end by the auditor; they were not reproduced at runtime.

---

## Severity index

| # | Finding | Severity |
|---|---|---|
| S1 | Cross-tenant document read via unscoped `findDocumentById` | **Critical** |
| S2 | Forged unsigned JWT yields permissions on public capability routes | **Critical** |
| S3 | Real `WORKER_SERVER_SECRET` committed to git in two tracked files | **Critical** |
| S4 | ClickHouse availability gates API/worker boot | **Critical** |
| S5 | Analytics ingestion is at-most-once; flush errors swallowed | **Critical** |
| S6 | No SIGTERM handling in the API process | **Critical** |
| S7 | Domain event bus is at-most-once with no replay; handler errors swallowed | **High** |
| S8 | Redis fan-out health can never report degraded after startup | **High** |
| S9 | Redis connection helper cannot express TLS/username/db | **High** |
| S10 | Storefront hot path: uncached tenant settings + unindexed slug scan | **High** |
| S11 | Machine transition hooks run outside the transaction, inline on the request | **High** |
| S12 | `flag_evaluations` unbounded in Postgres; ClickHouse migration never done | **High** |
| S13 | `trackBatch` issues one awaited Redis round-trip per event | **High** |
| S14 | Multi-instance hazards: SSE, collab, caches, `server_version` races | **High** |
| S15 | Unbounded growth: idempotency + provider receipts, no cleanup | **Medium** |
| S16 | No metrics, no readiness probe, `/health` always 200 | **Medium** |
| S17 | ~39 of 64 env vars undocumented, zero boot-time validation | **Medium** |

---

## 1. Connection management

**[verified]** Postgres is one process-global `postgres(connectionString, { max: 10 })` per process (`server/src/drizzle.ts:19`), created once in `createApp` (`bootstrap.ts:89`). The pool cap is **hardcoded at 10**, not env-tunable, with no `idle_timeout`/`max_lifetime`/`statement_timeout`.

HTTP handlers and — by default — **all BullMQ workers share that same 10-connection pool**. With `RUN_WORKERS` defaulting to true (`shared/worker-runtime.ts:21-23`), one API replica runs 7 workers. At N API replicas: 10×N connections, no PgBouncer anywhere in `docker-compose.yml`. A few long JSONB `ILIKE` searches (`documents/adapters/postgres.ts:283-310`) can pin all 10 slots and stall the whole replica.

**[verified]** Redis connection construction drops URL information: `getRedisConnection()` returns a bare `{host, port, password, maxRetriesPerRequest: null}` (`shared/redis.ts:1-11`). It **discards the URL username** (breaks Redis ACL auth), **ignores `rediss://`** (production must be plaintext), ignores db index and path, and sets `maxRetriesPerRequest: null` for *every* client — so commands queue forever during an outage instead of failing fast.

**[verified]** Connection multiplication: event-bus publisher+subscriber (`event-bus.ts:34-35`), SSE publisher+subscriber (`sse-manager.ts:46-47`), collab relay publisher+subscriber (`collab-redis-relay.ts:40-41`), one connection per `Queue` (`bullmq-queue.ts:13-16`), two per `Worker`. Net: **~20 Redis connections per API process**.

ClickHouse is a lazy module singleton (`analytics/adapters/clickhouse.ts:71,113-114,207`) with a 10 s request timeout and no compression.

No connection *leak* was found (clients are module singletons, never per-request). The risk is multiplication plus one unbounded pool per process.

---

## 2. Domain event durability — **S7**

**[verified]** `shared/event-bus.ts:13` holds an in-process `handlers` map; `:57-64` publishes locally then best-effort to Redis pub/sub; `:50-53` logs "degraded to single-instance mode" when Redis is absent.

**No outbox, no persistence, no replay.** `AggregateRoot` buffers events in memory (`aggregate-root.ts:5-17`) and `flushEvents` publishes with `void eventBus.publish(...)` — un-awaited, errors swallowed (`:19-23`). The same pattern appears at call sites across the codebase (`machines/engine.ts:66,84,119,145`; `documents/services/pages.service.ts:83-127`; `assets.service.ts:10,44-95`).

Documents are committed to Postgres **before** the event is published (`content.service.ts:45-54`) — so a crash in that window leaves a committed write with a **permanently lost event and no reconciliation path**.

`publish` awaits local handlers inline in the caller's stack (`event-bus.ts:60`), so subscribers that do I/O (analytics enqueue, extension dispatch, webhook enqueue, notification send) add latency to the request that emitted the event.

Multi-instance semantics: each replica sees every event once (Redis pub/sub with an origin filter, `:40,62`). But a replica whose subscriber connection is down during a publish simply **loses that event forever** — there are no consumer offsets.

**Fix.** Redis Streams or BullMQ queues with consumer groups and an offsets/dead-letter table. Never swallow handler errors — surface them as Evidence. Make `flushEvents` await or enqueue durably.

---

## 3. Queues

**[verified]** 7 queues with Dragonfly hashtag names (`bullmq-queues.ts:2-10`), lazily created process singletons.

Workers are constructed as a **side effect of building each domain** (`analytics/index.ts:20`, `notifications/index.ts:42`, `webhooks/index.ts:30`, `agent/index.ts:56`, `tenant/index.ts:17`, `integrations/index.ts:76-82`), so by default the API process is also the worker fleet; `RUN_WORKERS=false` is the opt-out.

Retry configuration is inconsistent:

| Queue | attempts | Backoff |
|---|---|---|
| analytics | **1** | — |
| agent | BullMQ default (1) | — |
| webhook (outbound) | BullMQ default (1) | — |
| email/SMS | 5 | exp 5 s |
| provider events | 5 | 2 s |
| extension delivery | 5 | 2 s |
| catalog build | 3 | 5 s |

**No dead-letter queue, no `removeOnFail: false` archive, no failed-job alerting.**

Other findings:
- Idempotency is check-then-act plus BullMQ `jobId` dedupe (`notifications/outbound.ts:73-78,138-143,165-178`) — a concurrent duplicate can create a duplicate `deliveries` row with a colliding jobId.
- Extension dispatch enqueues with `void getExtensionDeliveryQueue().add(...)` inside an awaited subscriber (`extension-dispatcher.ts:88-92`) — a Redis failure becomes an unhandled rejection while the parent request still returns 200.
- Graceful shutdown exists **only** in the worker entrypoint (`worker.ts:36-62`, 15 s force timer) and it closes *Queues*, not *Workers* — in-flight jobs are not awaited.

---

## 4. Concurrency and locking

**[verified]** Machines use **optimistic CAS**, not row locks: `UPDATE … WHERE revision = expectedRevision` inside a transaction that also inserts the transition (`machines/adapters/postgres.ts:68-104`). No `SELECT … FOR UPDATE` and no advisory locks exist anywhere in the repo. No deadlock risk (single row, consistent order), but no serialization guarantee beyond the CAS.

**[verified] The most serious correctness gap: transition hooks run outside both the CAS transaction and the request boundary.** `engine.transition` commits, publishes, then `await hooks.onTransitionComplete(...)` (`engine.ts:138-163`); that chain (`bootstrap.ts:162-189`) performs commerce order projection, audience attribution, analytics ingest, and notification rendering/queueing — multiple DB round-trips plus queue work, all inline on the HTTP request. A throw after commit returns 500 with the state change already applied and side effects partially applied. Recovery is narrow: `replayPersistedTransition` (`engine.ts:170-204`) handles paid carts only and scans at most 200 transitions (`adapters/postgres.ts:231`), so it silently fails to recover on long-lived instances.

**[verified]** Capability idempotency claims soundly (`INSERT … ON CONFLICT DO NOTHING` + status/attempt-token CAS, `capabilities/idempotency.ts:56-163`) — but reclaim only happens when `expires_at <= now` or status is `failed`. A worker killed mid-flight leaves `processing` for the full **24 h** retention, and every retry gets HTTP 409 for a day. Nothing ever deletes expired rows (`capabilities/schema.ts:17,25`) → unbounded table growth.

**[verified]** `recordDocumentOp` computes `server_version` as `max+1` in the same INSERT with **no unique constraint** on `(org_id, document_id, server_version)` (`documents/adapters/postgres.ts:346-392`; `documents/schema.ts:130-150`). Concurrent edits silently produce duplicate server versions, breaking client op-replay/merge.

**[verified]** No network call occurs inside a DB transaction (`db.transaction` appears only in `machines/adapters/postgres.ts:70` and `audiences/adapters/postgres.ts` — all DB-only). Good.

---

## 5. Analytics ingestion at scale — **S5, S13**

**[verified]** Two paths: `track`/`trackBatch` → BullMQ (`analytics/service.ts:40-70`), and `ingestServerEvent` → direct ClickHouse insert for `machine.transition`/`task.failed` (`:89-93`) — the synchronous path runs inside the event-bus dispatch, i.e. inside the originating HTTP request.

**[verified] The worker acks before the write.** The processor pushes job data into an in-memory batch and returns; `flush()` runs only at 50 events or on a 2 s timer (`analytics/worker.ts:11-58`). With `attempts: 1` (`analytics/queue.ts:9`) and `removeOnComplete: {count: 0}`, a crash or deploy **loses up to 49 accepted events with no retry and no DLQ**. Worse, ClickHouse write failures are caught and **swallowed** inside `flush()` (`worker.ts:32-37`) — the job completes "successfully" and the data is silently dropped.

**[verified]** `trackBatch` awaits `this.track()` **serially per event** (`service.ts:64-70`): a 100-event browser batch is 100 sequential Redis round-trips in the request path.

**[verified]** ClickHouse table is monthly-partitioned with 90-day TTL, ordered `(org_id, event_type, timestamp)` (`clickhouse.ts:94-97`) — reasonable, but no per-tenant partitioning and no cluster awareness. `ensureClickHouseTable` runs DDL plus 9 sequential `ALTER`s at **every process boot** (`:113-119`).

**No backpressure**: no queue-depth check, no jobId coalescing, no sampling, and no metric for queue depth, batch size, or dropped batches.

**Write amplification:** analytics subscribes to **every** domain event (`analytics/listeners.ts:5-10`) and every flag evaluation publishes an event (`flags/evaluation.ts:120,139,153`) — one Redis job per flag evaluation per request, alongside the flag-evaluation DB insert.

---

## 6. Caching and invalidation

**[verified]** In-process only, except the edge: LLM key cache `Map` (`secrets/service.ts:23-59`, invalidated only in the writing process at `:209-214`), ZITADEL management token (`auth/adapters/zitadel/management.ts:59-93`), edge KV + mem (`workers/src/cache.ts`).

**[verified] No tenant-settings cache.** `tenantSettings.get()` hits Postgres on every call and *writes a default row* if absent (`tenant-settings.service.ts:22-26`). It is on the hot path of every anonymous storefront call via `requirePublicActor` (`shared/public-actor.ts:30`) plus each storefront listing, and repeatedly within a single notification.

**[verified] Slug resolution is a sequential scan.** `findOrgIdByStoreSlug` scans `documents` JSONB (`documents/adapters/postgres.ts:61-74`) with **no index on `data->>'slug'`** (`documents/schema.ts:67-77`). Every edge slug-cache miss (300 s TTL) costs a scan that grows linearly with tenant count.

**[verified] No cache invalidation anywhere.** Grep for a KV purge in code returns nothing; the server has no Cloudflare API client. Publishing a layout leaves bots on stale HTML for up to ~5½ minutes (slug 300 s, bot-schema 300 s) with no way to force a refresh. A slug rename is stale for the same window.

**[verified] No stampede protection** — no single-flight/mutex. Edge bot-schema, slug, and JWKS caches all let N concurrent misses fan out to origin. The edge `memCache` (`cache.ts:6`) has no size bound or eviction. `withJitter(ttl)` is sampled **twice** per write (`cache.ts:39,41`) so the memory and KV expiries diverge, and `getCached` never repopulates `memCache` from a KV hit (`:24-26`) — the memory tier is near-useless after isolate recycling.

Cache keys were verified tenant-scoped (`slug:${slug}`, `bot-schema:${siteId}:${pathname}`, `jwks:${issuer}`) — **no cross-tenant key collision found**. The bot-schema key omits locale (within-tenant wrong variant for 300 s, not a leak).

---

## 7. Multi-tenant isolation

### 7.1 Propagation (sound)

Edge signs `x-org-id:userId:role`; the server verifies (`shared/org.ts:27-61`) and rejects fail-closed when `WORKER_SERVER_SECRET` is set (`:59-61`). Agent tokens are checked against the HMAC org (`auth/guards.ts:63-66`). Analytics reads are correctly pinned to the HMAC org (`analytics/read-guards.ts:25-31`).

### 7.2 **S1 — Cross-tenant document read [verified statically]**

`DocumentStorage.findDocumentById(id)` takes **no `orgId`** (`documents/ports.ts:348`; adapter `documents/adapters/postgres.ts:226-229` — `where(eq(documents.id, id))`). Most call sites compensate with an explicit `doc.orgId !== orgId` check. **Two do not:**

- `documents/services/content.service.ts:78-84` `findById(_orgId, id, …)` — the org parameter is **ignored**; it is used only to look up the content-type schema.
- `documents/services/content.service.ts:176-178` `resolve()` — checks only `existing.type !== type`.

Reached from `GET /api/documents/:type/:id` (`documents/routes/content.ts:60-69`) and `GET /api/documents/:type/:id/resolve` (`:71-78`). Both require only `PERMISSIONS.CONTENT_DRAFT_WRITE` — i.e. **any staff user in any org** can read another org's document by UUID.

Writes are **not** affected: `requireContentEntry` (`documents/services/document-guards.ts:51-55`) does check `existing.orgId !== orgId`, as do the other guard paths. So this is a read leak, not a write leak.

**This is the "caller-enforced tenancy" anti-pattern**: the data-access boundary does not enforce tenancy, and correctness depends on every caller remembering.

**Fix.** Add `orgId` to `findDocumentById` / `updateDocument` / `publishDocument` / `archiveDocument` / `deleteDocument` and filter in SQL. Fail closed. Then add a test asserting each route rejects a foreign-org id.

### 7.3 **S2 — Forged unsigned JWT grants permissions on public capability routes [verified statically]**

This is the most serious finding in the audit. The chain:

1. **The edge marks all capabilities public.** `workers/src/routes/public-routes.ts:43` — `{ method: "POST", pattern: /^\/api\/capabilities\/[^/]+$/ }`.
2. **But only one capability gets credential validation.** `proxy.ts:38-41` `isOptionalAuthRoute()` returns true only for `GET /api/edge/schema/:id` and `POST /api/capabilities/commerce.checkout`. For every other capability, `optionalAuth === false` and `isPublic === true`, so the JWT branch at `:112-122` is skipped entirely — the edge **never validates the token**.
3. **The edge still forwards the raw credential.** `proxy.ts:167-175` — `if (!optionalAuth) { …headers.set("Authorization", authorization) }`. The comment at `:165-166` says the verified HMAC "is the identity contract; never pass the raw user credential to origin as identity" — but the condition is inverted relative to that intent, so on public-but-not-optional routes the unvalidated credential **is** forwarded.
4. **The HMAC carries an empty identity.** `:145` signs `hmacHeaders(orgId, jwt?.userId ?? "", jwt?.role ?? "", env)` — with `jwt === null`, the signed user id and role are empty strings. The org comes from the Host/path slug, so a request to `{victim-store}/api/capabilities/...` is HMAC-signed **for the victim org**.
5. **The origin trusts the raw token for permissions.** `auth/guards.ts:45` — `getUserId(c) || userIdFromAccessToken(userToken)`: with the HMAC user id empty, the **forged token's `sub`** is accepted. `:82-85` then calls `resolveAuthContextFromAccessToken` → `packages/auth/src/oidc/resolve-auth-context.ts:83` → `packages/auth/src/jwt/decode.ts:14`, whose own comment at `:13` reads *"no signature verification — trust edge/API gateway"*. The edge is precisely the component that did not verify.
6. **Wildcard role claim is accepted with no project check and no signature.** `packages/auth/src/jwt/roles.ts:47-52` — `payload["urn:zitadel:iam:org:projects:roles"]` as an **array of strings** is honored whenever the entry is a platform role, independent of `projectId`.
7. **The capability gate then passes.** `capabilities/routes.ts:56-68`: `actorId = getUserId(c)?.trim() || undefined` is `undefined` (HMAC empty). Only `publicAccess === "publishable-key"` capabilities take the publishable-key branch — and `commerce.checkout` is the only one (`verticals/src/commerce/capabilities.ts:190`). For `commerce.orders.search` / `.cancel` / `.fulfill` / `.refund` (`:192-221`, permissions `COMMERCE_ORDERS_VIEW` / `COMMERCE_ORDERS_MANAGE`) the code calls `denyUnless(c, definition.permission)` → `requireActorPermission` → `requireAuthenticatedActor` → the unverified payload.

**Net effect:** a crafted unsigned JWT containing `urn:zitadel:iam:org:projects:roles: ["admin"]` plus a `sub`, sent to a victim store's host, satisfies the permission check for those capabilities. `commerce.orders.search` is a *query* (no Idempotency-Key required), so it is directly reachable; the mutating operations additionally require `authorize` (an existing order id in that org) — which the search capability supplies.

**[verified statically, not reproduced at runtime]**. Two secondary unknowns are recorded honestly: whether ZITADEL roles are project-wide in this deployment, and whether any deployment actually exposes capability routes publicly. Neither affects the code defect.

**Fix (do this first).**
1. **Verify the JWT signature at the origin** (JWKS) before deriving permissions, or
2. **Strip `Authorization` on all public routes** at the edge and rely solely on the HMAC-signed `x-user-id`/`x-role`; and
3. Remove the `urn:zitadel:iam:org:projects:roles` wildcard path from `roles.ts`, or gate it behind a development flag;
4. Add a regression test asserting a forged-role token is rejected on every route in `PUBLIC_ROUTES`.

### 7.4 No human-actor ↔ org binding [report only, not confirmed exploitable]

Agent tokens are checked against the HMAC org (`auth/guards.ts:63-66`); **human** permissions come solely from the JWT (`:81-91`) with no per-org membership check. Because the edge derives org from the **path slug first** (`workers/src/routes/resolve-proxy-org.ts:13-17`) while forwarding the user's JWT, `{otherStoreSlug}.host/api/...` is signed as the other org with the caller's identity. Whether that crosses tenants depends on whether ZITADEL roles are project-wide (not verified). The code performs no per-org membership check — the asymmetry is real regardless.

---

## 8. **S3 — Committed secret [verified]**

`packages/workers/.dev.vars` is **tracked in git** (`git ls-files` confirms; present in the HEAD tree as blob `ee47970`) and contains a single line with a **real `WORKER_SERVER_SECRET` value**. The identical value is committed in **`docs/2026-07-13/AUTH.md` at lines 72, 81, and 112**, and matches the values in the gitignored `.env` and `packages/server/.env`.

`.env.example` correctly uses a placeholder (`WORKER_SERVER_SECRET=change-me-in-production`), so the leak is the tracked `.dev.vars` plus the doc, not the example files.

This secret is the entire edge→origin trust boundary: whoever holds it can impersonate any user in any org (see S2 §7.3). It also doubles as the SSE stream-ticket secret (`notifications/stream-ticket.ts:13`) and the agent-token comparison key — **one secret, three trust boundaries**.

**Fix.** Rotate the secret immediately; remove the value from `.dev.vars` and `AUTH.md`; add `.dev.vars` to `.gitignore` and commit a `.dev.vars.example`; implement the already-written plan in `docs/2026-08-23/SHARED-SECRET-STRATEGY.md` (canonical `env/.env.shared` + `secrets:sync`/`secrets:check`); add fingerprint-prefix logging on both sides so mismatch is diagnosable. Consider purging git history since the blob is in HEAD.

**Fragility is quantified:** the secret has **9 read sites** in production code (1 worker, 5 server, 3 tooling) and its verification logic is **duplicated** in `shared/org.ts:27-37` and `shared/tenant.ts:20-30`. `shared/tenant.ts` is **dead code** (its middleware is registered nowhere) and is *weaker*: it only `console.warn`s on a missing HMAC (`:47-49`) instead of returning 401, and signs a header (`x-tenant-id`) the worker never sets. It is a latent bypass if ever wired up. **Delete it.**

---

## 9. **S4 — ClickHouse gates process boot [verified]**

`analytics/index.ts:13` awaits `ensureClickHouseTable()`, which runs DDL plus 9 sequential `ALTER`s (`clickhouse.ts:113-119`). `createAnalyticsDomain` is awaited by `createApp` (`bootstrap.ts:137`), which `index.ts:22` awaits at top level.

**ClickHouse down ⇒ `createApp()` rejects ⇒ the API and worker processes never start.** A restart or deploy of the analytics store takes down the entire platform, including features that do not use ClickHouse at all.

**Fix.** Make `ensureClickHouseTable` lazy and retrying, never fatal; report analytics health separately via a readiness probe; serve degraded rather than crash-loop.

---

## 10. **S6 — No graceful shutdown in the API process [verified]**

`server/src/index.ts:1-31` has **no `process.on("SIGTERM")`**, no `server.close()`, no connection draining — the `serve()` handle is discarded (`:26-30`). `tracing.ts:49-51` registers a SIGTERM handler that shuts down only the tracer.

On every deploy the runtime kills the process after the grace period: in-flight requests are cut, never-ending SSE streams (`notifications/routes/stream.ts:84-86`) are severed, and any in-process worker mid-job is cut (default `RUN_WORKERS=true`). SSE clients are in-process maps with no persistence (`sse-manager.ts:17`), so a rolling deploy drops every stream and the client must re-mint a 60 s ticket. There is no readiness gate: a replica that fails `createApp` crash-loops instead of serving degraded.

---

## 11. **S14 — Multi-instance hazards (explicit list)**

1. **SSE fan-out depends on Redis.** Without it, only clients on the publishing replica receive the event; `broadcast` delivers the publisher's own replica **only via the Redis echo**, so a broken subscriber silently drops even local delivery (`sse-manager.ts:96-102`).
2. **Collab state is per-process.** Yjs rooms and Automerge layout rooms live in memory; cross-replica relay is best-effort fire-and-forget with no ordering or loss guarantees, and identically-named rooms on different replicas merge only via debounced full snapshots (5 s, `layout-room.ts:29`).
3. **No cross-replica cache invalidation** for slug/tenant-settings/secrets.
4. **Duplicate `document_ops.server_version`** under concurrent writers (§4).
5. **Concurrent `createDocument`** for the same `(org, type, key, segment)` races `latestVersion` then insert (`documents/adapters/postgres.ts:144-163`); the unique index catches it but callers see a generic 409 with no retry (`error-handler.ts:13-20`).
6. **In-memory analytics batch mixes tenants** — a crash loses events for all tenants at once.
7. **Provider-event dedupe claim/execute split**: a receipt is claimed at enqueue, but the worker re-executes on retry without re-claiming (`integrations/service.ts:321-324` vs `provider-event-worker.ts:44-78`) — safe only because the machine CAS rejects the replay.
8. **Single-threaded Dragonfly** in compose is a shared bottleneck for 7 queues + pub/sub.
9. **Machine instance pagination** pages by `(expr, id)` without a stable index on the JSONB date expression (`machines/adapters/postgres.ts:192-196`) — full scans as instances grow.

---

## 12. **S8 / S9 / S16 / S17** — operability gaps

- **Health signal incapable of failing.** Subsystems register `publisher !== null` at startup (`event-bus.ts:31`, `sse-manager.ts:43`, `collab-redis-relay.ts:37`); the object is never nulled after a post-startup outage, so `/health` reports `degraded:false` forever and the 5-minute degraded logger never fires (`redis-fanout-status.ts:34-46`). A false-negative alert signal is worse than none.
- **No metrics at all.** Tracing is thorough (OTLP HTTP, batch 2048/512/5 s) but **there is no metrics SDK or exporter** — queue depth, job failure rate, Redis degraded state, ClickHouse batch loss, and pool saturation are all unmeasured. `/health` returns 200 without checking Postgres or ClickHouse; there is no `/ready` or `/metrics`.
- **Trace propagation is incomplete.** The edge forwards `traceparent`/`tracestate` (`proxy.ts:157-160`) and queue injection exists (`shared/bullmq-trace.ts:9-16`) but is used by **only 2 of 7 queues** (agent, catalog). Analytics, email, webhook, extension, and provider-event jobs carry no trace context → orphan root spans.
- **No log correlation.** No logger abstraction, no request id; `console.*` with ad-hoc fields; a 500 returns `{error: "Internal server error"}` with the trace id nowhere in the response (`bootstrap.ts:69-74`).
- **Config sprawl.** 64 distinct `process.env.*` names referenced in `packages/server|workers/src`, 25 documented in `.env.example` → **~39 undocumented knobs**. **Zero boot-time validation**: no env schema, no aggregate fail-fast. Only scattered inline guards; everything else silently falls back to a localhost/dev default (`redis.ts:2`, `clickhouse.ts:60`, `tracing.ts:7`, and an **empty-string default** for `AGENT_TOKEN_SECRET` at `guards.ts:60`). A missing `REDIS_URL` in production silently points at localhost; `getRedisConnection` cannot express TLS, so managed Redis is unusable without a code change.

---

## 13. Single points of failure

| SPOF | Blast radius |
|---|---|
| **Redis / Dragonfly** | event bus, SSE fan-out, collab relay, all 7 queues. Loss degrades silently to single-instance with a health flag structurally unable to flip. |
| **ClickHouse** | not just analytics — **gates process boot** (S4). |
| **Postgres** | single instance, no pooler, one 10-connection pool per process shared with workers. |
| **ZITADEL** | login, JWT verification, management API; per-process token cache causes a thundering herd after each deploy (`management.ts:61-93`). |
| **Vault** | every comms-credential and LLM-key path; no read-through cache for comms. |
| **The API process itself** | by default hosts HTTP + all 7 workers on one event loop and one connection pool. |

---

## 14. Top 17 risks, ranked

| # | Sev | Risk | Evidence | Fix |
|---|---|---|---|---|
| 1 | **Critical** | Forged unsigned JWT → permissions on public capability routes | `public-routes.ts:43`, `proxy.ts:38-41,167-175`, `guards.ts:45,82-85`, `jwt/decode.ts:13`, `jwt/roles.ts:47-52`, `capabilities/routes.ts:56-68` | Verify JWT at origin **or** strip `Authorization` on public routes; remove the wildcard role claim; regression test |
| 2 | **Critical** | Committed real `WORKER_SERVER_SECRET` | `packages/workers/.dev.vars` (tracked, in HEAD), `docs/2026-07-13/AUTH.md:72,81,112` | Rotate now; gitignore + example file; implement `SHARED-SECRET-STRATEGY.md`; purge history |
| 3 | **Critical** | Cross-tenant document read | `documents/ports.ts:348`, `adapters/postgres.ts:226-229`, `content.service.ts:78-84,176-178`, `routes/content.ts:60-78` | Put `orgId` in the storage signature; fail closed; test |
| 4 | **Critical** | ClickHouse down ⇒ API/worker crash-loop | `analytics/index.ts:13`, `clickhouse.ts:113-119`, `bootstrap.ts:137`, `index.ts:22` | Lazy, retrying, non-fatal; separate readiness |
| 5 | **Critical** | Analytics at-most-once; flush errors swallowed | `analytics/worker.ts:20-58`, `analytics/queue.ts:9` | Flush inside the job, `attempts: 5`, DLQ, metric on failure |
| 6 | **Critical** | No SIGTERM handling in the API | `index.ts:1-31` | Stop accepting → `server.close()` → drain SSE/queues/DB with a timeout |
| 7 | **High** | Event bus at-most-once, no replay, errors swallowed, un-awaited after commit | `event-bus.ts:19-23,57-64`, `aggregate-root.ts:19-22` | Redis Streams/queues + consumer groups + DLQ; never swallow; durable flush |
| 8 | **High** | Redis helper drops TLS/username/db | `shared/redis.ts:1-11` | Pass the URL through; `maxRetriesPerRequest: null` only for BullMQ |
| 9 | **High** | `flag_evaluations` unbounded in Postgres; documented ClickHouse migration never done | `flags/schema.ts:38-58`, `flags/evaluation.ts:120,139,153` | Implement the ClickHouse sink or batch/sample; stop per-evaluation events |
| 10 | **High** | Storefront hot path: uncached tenant settings + unindexed slug scan | `tenant-settings.service.ts:22-26`, `public-actor.ts:30`, `documents/adapters/postgres.ts:61-74`, `schema.ts:67-77` | TTL cache with event invalidation; partial index on `(data->>'slug')` |
| 11 | **High** | Transition hooks run outside the transaction, inline | `machines/engine.ts:138-163`, `bootstrap.ts:162-189` | Queue hooks keyed by transition id; idempotent + retriable |
| 12 | **High** | `trackBatch` = one await per event | `analytics/service.ts:64-70` | `addBulk`; cap batch size |
| 13 | **High** | No edge cache invalidation; no stampede protection; double-sampled jitter | `workers/src/cache.ts:24-26,39,41`; no purge path | Version key or Cloudflare purge on publish; single-flight; sample jitter once; warm memCache |
| 14 | **High** | MF version skew unenforced (tenant bundles 0.19 vs host 0.20) | `tenant/adapters/bundler.ts:53-60`, `client/package.json:18-19`, `mf-init.ts:39-62` | Single source of shared versions; fail the build on divergence |
| 15 | **Medium** | Unbounded tables (idempotency, provider receipts) | `capabilities/schema.ts:17,25`, `integrations/provider-event-receipts.ts` | Retention/cleanup jobs |
| 16 | **Medium** | Duplicate `document_ops.server_version` | `documents/adapters/postgres.ts:365-391`, `schema.ts:130-150` | Unique index + retry, or a per-document sequence |
| 17 | **Medium** | No metrics/readiness; `/health` always 200; degraded flag can't flip; ~39 undocumented env vars, no validation | `bootstrap.ts:75-81`, `redis-fanout-status.ts`, `.env.example` | Add metrics + `/ready`; validate env at boot and fail fast |

---

## 15. What this means for scale

The system is built for **a single, long-running, stateful API process per environment**. That is a legitimate choice for the current stage, and several parts (edge prerender, stateless request handling, port/adapter boundaries) will scale horizontally as designed.

The things that do **not** scale are concentrated in three places:

1. **Durability**: the event bus and analytics pipeline are at-most-once with swallowed errors. More replicas and more deploys mean more silent loss, not more throughput.
2. **Process affinity**: SSE, collab, caches, and queue workers all assume the replica that produced a fact still exists. Redis is the only bridge, and its health signal cannot report failure.
3. **Boundary enforcement**: tenancy is enforced by caller discipline rather than by the data-access layer (S1), and identity is enforced at the wrong layer (S2). Both get *more* dangerous as the surface grows, because neither is caught by the type system or by CI.

The first three items in §14 are correctness/security defects, not scale-readiness items, and should be fixed before any capacity work.
