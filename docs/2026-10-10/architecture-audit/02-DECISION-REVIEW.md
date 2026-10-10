# 02 — Architecture Decision Review

**Question answered:** for every architecture decision this project has recorded, is it still followed, does it hold at scale, and should it be kept, revised, or replaced?

**Sources of record:** `apps/docs/docs/decisions/ADR-0001…ADR-0011` (the formal registry, all `recorded`/`last_verified: 2026-09-14`), `docs/2026-07-04/ARCHITECTURE_DECISIONS.md` (banner-stale, but the most discoverable), `docs/2026-05-23/TECH.md`, `docs/2026-08-07/JSON-RENDER-REFERENCE-PATTERNS.md`, `docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md`, `docs/2026-09-26/*`.

All verdicts were verified against code, not against other documents.

---

## Verdict summary

| # | Decision | Verdict | Scale risk |
|---|---|---|---|
| D1 | Server is a pure API server (no React/SSR/JSX) | **Partially followed / text wrong** | Medium (build CPU next to API) |
| D2 | Edge SEO prerender + client interactive bundle from JSON specs | **Followed** | Medium (no cache invalidation) |
| D3 | ZITADEL + edge JWT + HMAC trust; "PII never touches the API server" | **Partially followed; PII clause abandoned** | **Critical** (single unrotatable global secret, no replay protection) |
| D4 | Everything is a generic XState machine; new flow = JSON not code | **Partially followed; promise false** | High (transition log unbounded) |
| D5 | In-memory synchronous event bus for Phase 0 | **Superseded in code; doc stale** | **Critical** (at-most-once, silent loss) |
| D6 | Monorepo = two packages; no admin/catalog/types packages | **Abandoned** | Low (doc accuracy) |
| D7 | Postgres JSONB + relational, ClickHouse analytics, Redis queues | **Followed** | High (single Postgres, one hot table) |
| D8 | Identity-agnostic platform; commerce is a vertical, not a server domain | **Followed (best-scaling decision)** | Low–Medium (3 leaks, capability namespace) |
| D9 | Feature flags built natively, not LaunchDarkly | **Followed; scale plan unexecuted** | High (`flag_evaluations` unbounded in Postgres) |
| D10 | Unified `documents` domain + type registry | **Followed, consolidated further** | High (single wide table, no partitioning) |
| D11 | Inline visual editor inside `packages/client`, not GrapesJS | **Partially followed; form drifted toward GrapesJS** | Medium (two sources of layout truth) |
| D12 | Module Federation + per-tenant catalogs on R2 | **Followed; version skew unenforced** | High (tenant runtime breakage) |
| D13 | Evidence/provenance kernel | **Followed** | High (4 append-only tables, no retention) |
| D14 | Audiences/experiences replace request-signal `contextHash` | **Followed — most rigorously executed** | Medium (anonymous personalization impossible by design) |
| D15 | Docusaurus + Diátaxis docs; dated docs retained as history | **Partially followed** | Medium |

---

## D1 — Server is a pure API server: no React, no SSR, no JSX

**Verdict: Partially followed; the recorded text is factually wrong.**

**Evidence against.** `packages/server` renders React: `domains/notifications/email-template.ts:2` imports `renderToHtml` from `@json-render/react-email` (deps `@react-email/components`, `@react-email/render` at `package.json:46-47`). It also ships a **build toolchain**: `domains/tenant/adapters/bundler.ts:5-6` imports `ModuleFederationPlugin` and `rspack` (dep `@rspack/core` at `package.json:48`), compiling `.tsx` at `:123`. This directly contradicts `ARCHITECTURE_DECISIONS.md:42-43` and `:203`.

**Scalability.** Email rendering is cheap but runs inline. Tenant component bundling is CPU-bound with a 120 s ceiling and 100 KB source cap, executed by `tenant/worker.ts` in the same process family. At 10× tenants a publish storm competes with request handling on the same event loop. There is no separate build fleet.

**Cost/benefit.** Bought one deployable monolith with a shared document/email model. The cost is that the "pure API" invariant — which future decomposition reasoning depends on — is no longer true.

**Recommendation: revise the decision text, keep the code.** Restate D1 as "the API server hosts rendering only for non-interactive artifacts (email HTML) and build tooling, both isolated behind workers." Move `@rspack/core` / `ModuleFederationPlugin` behind a dynamic import inside `tenant/worker.ts` so API replicas never load the bundler.

---

## D2 — Rendering split: edge SEO prerender + client interactive bundle

**Verdict: Followed.**

**Evidence.** `workers/src/routes/bot-ssr.ts:8-9` (`react-dom/server.edge`, `renderToReadableStream`), `:138`; client renders specs via `@json-render/react` (`editor/components/shell/EditPageView.tsx:3`). Roadmap records completion for local scope at `AUTHORITATIVE-ROADMAP-CURRENT.md:118-126`.

**Scalability.** The shape is correct for 100× traffic — prerender once, serve from KV, hydrate the interactive parts. The failure mode is **staleness, not load**: there is no invalidation path at all (see 05 §6). `AUTHORITATIVE-ROADMAP-CURRENT.md:279` still lists "Production edge cache invalidation" as P2/open.

**Recommendation: keep.** Next step: a publish-triggered purge keyed by `(orgId, type, key, segment)`, or a version-key comparison so the worker can detect a stale entry.

---

## D3 — ZITADEL + edge JWT validation + HMAC trust; "PII never touches the API server"

**Verdict: Partially followed. The PII clause is abandoned. The HMAC contract is the single largest security and operational liability in the system.**

**Auth followed.** Edge validates via `@cfworker/jwt` (`workers/src/auth.ts:12-17`) with a JWKS cache (`jwks-cache.ts`). Compose runs ZITADEL **and Keto** (`docker-compose.yml`), so authorization is ZITADEL + Ory Keto, not ZITADEL alone — the doc understates this.

**HMAC followed.** `workers/src/hmac.ts:21-40` signs `orgId:userId:role`; `server/src/shared/org.ts:27-37` verifies with `timingSafeEqual`; contract pinned only by a test (`shared/hmac.contract.test.ts`).

**PII clause abandoned.** The API server accepts and forwards plaintext credentials and MFA secrets: `domains/auth/routes/login.ts:19` (`password`), `adapters/zitadel/client.ts:105,115`, `adapters/zitadel/users.ts:73-77`, `routes/account.ts:57`, `adapters/zitadel/mfa.ts:49-62` (returns TOTP secrets).

**Scalability / security.** The signed payload contains **no timestamp, nonce, or expiry** (`hmac.ts:27`), so a captured header set replays indefinitely. One symmetric secret is read from env in **9 places** across worker, server, and tooling. Rotation requires a lockstep redeploy of edge + every API replica — already acknowledged as unresolved in `docs/2026-08-23/SHARED-SECRET-STRATEGY.md:5` ("Status: Proposal — not yet implemented"). At 10× tenants and multiple edge deployments there is no per-tenant or per-region key, so blast radius is global.

**Compounding finding (see 05 §7):** identity is HMAC-asserted *and* re-derived from an unverified JWT payload on public routes, which makes the edge/API trust boundary forgeable.

**Recommendation: replace the transport for the PII clause; revise the HMAC contract.**
1. Sign `(orgId, userId, role, iat, exp, kid)`; support two live secrets for rotation; emit a sha256 fingerprint prefix in logs on both sides.
2. Route credential-bearing calls (login, MFA, password) through a dedicated auth edge handler that never enters the main API process.
3. Verify the JWT signature at the origin before deriving permissions (see 05 §7).

---

## D4 — Everything is a generic XState machine; adding a flow = JSON, not code

**Verdict: Partially followed. The engine is real; the "JSON not code" promise is false for the first real vertical.**

**Engine is real.** `machines/engine.ts:1` uses `createActor`/`createMachine`; `:330,:397` build and start request-scoped actors. Tables at `machines/schema.ts:31,46,71`; no `carts`/`orders` tables exist anywhere, matching the design note at `:13-29`.

**Promise is false.** Checkout semantics are TypeScript: `verticals/src/commerce/checkout-flow.ts`, `order-projection.ts`, `capabilities.ts`, plus a **string-keyed handler registry** (`capabilities/registry.ts:56-59`). The roadmap itself states the policy: "These should be added as Commerce vertical capabilities and Commerce extension actions" (`AUTHORITATIVE-ROADMAP-CURRENT.md:257`). Plus a duplicated definition pair: `machineDefinitions` (`schema.ts:31`) and `machines` (`:94`).

**Scalability.**
- `machine_transitions` is append-only with index `instanceIdx` only (`schema.ts:86`) — no partitioning, no TTL. It becomes the hottest growth table and every audit read is a scan.
- Transition **hooks run outside the CAS transaction**, inline on the HTTP request (`engine.ts:138-163` → `bootstrap.ts:162-189` does order projection, audience attribution, analytics ingest, notification queueing). A hook throw after commit returns 500 with the state change already applied and side effects half-applied. p99 latency is dominated by the hook chain.
- Recovery is narrow: `replayPersistedTransition` scans at most 200 transitions (`adapters/postgres.ts:231`).

**Recommendation: revise.** (a) Collapse `machineDefinitions`/`machines` into one table with a migration. (b) Partition `machine_transitions` by month with retention. (c) Move transition hooks onto a queue keyed by transition id, made idempotent and retriable. (d) Stop claiming "flow = JSON"; publish the true contract: *JSON machine definition + a registered TypeScript capability handler*.

---

## D5 — In-memory synchronous event bus for Phase 0; BullMQ for async agent work

**Verdict: Abandoned/drifted — deliberately superseded under load, but never reconciled into the record.**

**Evidence.** `shared/event-bus.ts:1-2` imports `ioredis`; `:7` defines channel `noname:event-bus`; `:28-55` subscribes for cross-replica fan-out; `:50-53` logs "degraded to single-instance mode" when Redis is absent. BullMQ is far beyond "agent work": worker processes exist for analytics, agent, tenant, notifications, webhooks, and provider events, plus `shared/bullmq-queue.ts`.

**Scalability — the concrete failure mode.**
- Redis **pub/sub is at-most-once**: no persistence, no consumer groups, no replay. A replica that is restarting, deploying, or briefly disconnected misses every event in that window and never recovers.
- `dispatchLocal` **swallows all handler errors** (`event-bus.ts:19-23`); `aggregate-root.ts:19-22` publishes with `void` (fire-and-forget) after the Postgres commit. A crash between commit and publish = committed write with permanently lost event.
- Domain subscribers do I/O inline in the publisher's stack (`:60`), adding request latency.
- The health signal is structurally broken: subsystems report `publisher !== null` (`event-bus.ts:31`, `sse-manager.ts:43`, `collab-redis-relay.ts:37`), which is never re-nulled after a post-startup outage, so `/health` reports `degraded:false` forever.

**Recommendation: replace.** Move cross-replica fan-out to **Redis Streams or BullMQ queues with consumer groups** and an offsets/dead-letter table. Never swallow handler errors — surface them as Evidence. Fix the degraded flag to reflect actual client readiness.

---

## D6 — Monorepo = two packages; no admin package; no catalog/types packages

**Verdict: Abandoned (the "no admin package" half is followed).**

**Evidence.** 12 packages exist. `packages/documents` and `packages/shared` are precisely the kind of shared packages the decision said were deleted (`ARCHITECTURE_DECISIONS.md:28`). The no-admin-package claim holds — admin is a mode inside `packages/client/src/admin`.

**Scalability.** 12 packages is healthy. The real inconsistency is `apps/docs` sitting outside the workspace, forcing root scripts to use `--ignore-workspace` (`package.json:22-25`).

**Recommendation: revise the doc.** Correct `ARCHITECTURE_DECISIONS.md:14-28` to the actual map, and bring `apps/docs` into the workspace.

---

## D7 — Postgres JSONB + relational, ClickHouse for analytics, Redis for queues/cache

**Verdict: Followed.**

**Evidence.** `docker-compose.yml` runs postgres, dragonfly, clickhouse (+ keto, zitadel, s3, jaeger, vault, nango). Analytics is ClickHouse-only: `analytics/adapters/clickhouse.ts:73-98` — MergeTree, `PARTITION BY toYYYYMM(timestamp)`, `ORDER BY (org_id, event_type, timestamp)`, `TTL timestamp + INTERVAL 90 DAY`.

**Scalability.**
- The order key means any query *not* filtered by `event_type` (per-session replay, per-audience aggregation) degrades to a scan. No projections or materialized views.
- The 90-day TTL is hard-coded in DDL while `docs/2026-09-26/PERSONALIZATION-IMPLEMENTATION-PLAN.md:521` still lists retention as an open product decision.
- Postgres is a **single instance with no pooler**, and the documents / evidence / flags / audiences / machines tables share one 10-connection pool per process with fundamentally different write profiles.

**Recommendation: keep, with two changes.** Add a projection for `(org_id, session_id, timestamp)`; move TTL to configuration. Add PgBouncer before horizontal scaling (see 05 §1).

---

## D8 — Identity-agnostic platform; commerce is a vertical, not a server domain

**Verdict: Followed — this is the best-scaling decision in the set.**

**Evidence.** `packages/server/src/domains/commerce` does not exist. Semantics live in `packages/verticals/src/commerce`, UI in `packages/extensions/src/commerce`. The rule is even encoded in comments (`machines/schema.ts:13-29`). Ownership mapped at `AUTHORITATIVE-ROADMAP-CURRENT.md:45-58`.

**Scalability.** Verticals are additive and do not touch generic schemas. The only seam risk: the capability registry is a **flat string namespace** (`capabilities/registry.ts:56-59` throws on duplicates), so two verticals claiming `checkout.start` collide at registration time.

**Three verified leaks** (see report 01 §5): `machines/routes/instances.ts:25,68-221`, `integrations/extension-dispatcher.ts:52-59`, `documents/adapters/postgres.ts:92-93`.

**Recommendation: keep.** Namespace capability names by vertical (`commerce.checkout.start`) so collisions are impossible; close the three leaks.

---

## D9 — Feature flags built natively, not LaunchDarkly

**Verdict: Followed (form), but the recorded scale plan was never executed.**

**Evidence.** `domains/flags/` with `flags` + `flag_evaluations` tables (`flags/schema.ts:15-36,38-58`), SSE push (`routes/stream.ts`), public metadata endpoint. No LaunchDarkly dependency exists; the name appears only in docs.

**Scalability.** `ARCHITECTURE_DECISIONS.md:162` recorded "`flag_evaluations` (Postgres Phase 0 → ClickHouse at scale)". **That migration never happened** — `analytics/adapters/clickhouse.ts` has no evaluation table. So every visitor × every flag becomes a **Postgres row**, indexed `(flagId, evaluated_at)` and `(orgId, subjectKind, evaluated_at)` (`flags/schema.ts:56-57`). There is also **write amplification**: every flag evaluation publishes a domain event (`flags/evaluation.ts:120,139,153`) that the analytics domain turns into a Redis job (`analytics/listeners.ts:5-10`), while *also* inserting an evaluation row.

**Recommendation: revise.** Implement the recorded ClickHouse evaluation sink (or sample/batch in Postgres) before tenant growth; make retention explicit; do not emit a per-evaluation analytics event.

---

## D10 — Unified JSON `documents` domain with a type registry

**Verdict: Followed — and consolidated further than recorded.**

**Evidence.** `documents/schema.ts:15-30` documents one table owning every versioned JSON document; type registry at `:114-127`; append-only `documentOps` at `:130-150`. Note `ARCHITECTURE_DECISIONS.md:94` still describes `content_entries` + `layouts` — the merge is recorded **only in a code comment**.

**Scalability.**
- One wide table holding every layout, product, page, and asset-metadata row. No index on `data`, so content search is application-side (`packages/documents/src/content-search.ts`) plus full-text `LIKE` scans (`documents/adapters/postgres.ts:283-310`).
- Every save writes the full JSONB payload **plus a duplicate payload into `document_ops.payload`** (`:144`) — write amplification and TOAST bloat.
- `documents_published_unique` covers only `type = 'layout'` (`:70-72`). No partitioning by org or type.
- `document_ops.server_version` is computed as `max+1` with **no unique constraint** on `(org_id, document_id, server_version)` (`:346-392`, `schema.ts:130-150`) → concurrent edits silently produce duplicate versions, breaking client op-replay.
- `backend-logic` is still only a comment (`:25`); the registry's extensibility claim is unproven by a third type.

**Recommendation: keep the domain, revise the storage.** Partition `documents` by `org_id` hash or `type`; store a diff instead of a duplicate payload in `document_ops`; add the unique index on server versions; register a real third document type to prove the registry.

---

## D11 — Inline visual editor inside `packages/client`, not GrapesJS

**Verdict: Partially followed — location followed, form drifted toward the deferred option.**

**Followed.** `packages/client/src/editor/` (~96 files); `EditPageView.tsx` mounts the real renderer + `editorRegistry` in place. No separate admin app.

**Drifted.** The editor is no longer "click a component → edit props in a slide-out panel". It has a drag-drop palette, a layer tree, a canvas with drop handling, a props panel, an AI agent panel, and CRDT collaboration (Automerge/Yjs). `ARCHITECTURE_DECISIONS.md:213` explicitly deferred that class ("GrapesJS may be added *later* as an optional page-builder mode"). The recorded `withEditing` HOC **does not exist** in code (grep: 0 hits).

**Scalability.**
- Bundle surface: client deps now include tiptap, yjs, automerge, y-protocols, rrweb-player. The recorded "~50 KB editor" claim (`:193`) is not credible at 96 files.
- **Two sources of truth for layout**: the Postgres `documents` row vs the Automerge chunk store (`collab/postgres-automerge-storage.ts`, `r2-automerge-chunk-store.ts`), with a best-effort Redis relay between replicas. Multi-editor conflicts are resolved by CRDT while publish reads the relational row. **The reconciliation invariant is recorded nowhere.**

**Recommendation: revise.** Write the one-page invariant for Automerge → `documents` publish (who wins, when, how conflicts surface), and measure real editor chunk size against the recorded budget.

---

## D12 — Module Federation + per-tenant component catalogs on R2

**Verdict: Followed, with two concrete defects.**

**Evidence.** Server builds remotes (`tenant/adapters/bundler.ts:5-6`, `tenant/queue.ts`, `tenant/worker.ts`), R2 adapter + manifest stores, client loads them at runtime (`catalog-loader.ts:92-99,160,174,184`, `mf-init.ts:9-63`).

**Defect 1 — version skew, unenforced.** Tenant bundles pin shared deps to `@json-render/core` / `react` at `^0.19.0` (`bundler.ts:53-60`), while the host ships `^0.20.0` (`packages/client/package.json:18-19`). Independently, `mf-init.ts:39-62` **declares** shared `version: "0.19.0"`, `requiredVersion: "^0.19.0"`. With `singleton: true`, a tenant remote built against 0.19 can receive the 0.20 host instance and break at runtime — production-only, tenant-specific breakage that nothing detects.

**Defect 2 — the isolation model is a regex denylist.** `bundler.ts:11-17` blocks `child_process`, `node:fs`, `eval`, `Function` over a 100 KB source cap. That is not a sandbox: an accepted tenant component runs with full page and DOM context.

**Recommendation: revise.** Generate the shared-dependency versions from a single source used by both `bundler.ts` and `packages/client/package.json`, and **fail the tenant build when they diverge**. State the isolation model honestly in the ADR.

---

## D13 — Evidence/provenance kernel

**Verdict: Followed.**

**Evidence.** `evidence/schema.ts:13-38` (records with `integrityHash`, `idempotencyKey`, correlation/causation), `:40-67` (activities with input/output record ids), `:69-90` (typed links, unique edge), `:92-115` (audit events). Generic routes; Orders is a projection over Evidence (`verticals/src/commerce/order-projection.ts`). `ADR-0009` accepted.

**Scalability.** Four append-only Postgres tables on the same instance as the transactional documents table, competing for one pool. `data` is unindexed, so the generic read API filters only by type/subject/time — the roadmap already defers "Advanced Evidence pagination/search" to P2. **There is no retention or archival story at all**, unlike the audience ledger which carries `expiresAt` (`audiences/schema.ts:119,141`). At 100× traffic Evidence is the table that forces a migration under load.

**Recommendation: keep, add retention.** Define per-record-type retention/archival (preserving `integrityHash` on archive) and partition by month.

---

## D14 — Audiences/experiences replacing request-signal `contextHash`

**Verdict: Followed — the most rigorously executed decision in the set.**

**Evidence.** Flags keep `legacyContextHash` explicitly as archived, "never read by active APIs or new writes" (`flags/schema.ts:45`) alongside `subjectKind` (`:47`). Analytics keeps `context_hash` legacy-only and adds `audience_key`, `audience_definition_version`, `binding_id`, `binding_version`, `decision_id`, `page_key`, `locale` (`analytics/adapters/clickhouse.ts:90-91,102-111`). Ingest strips spoofed input (`analytics/browser-ingest.ts:16`); rejection guards at `flags/flag-validation.ts:43` and `flags/routes/evaluate.ts:108`. Full model in `audiences/schema.ts:14-257`.

**Scalability.** Decisions and outcomes carry explicit `expiresAt` with lazy cleanup (`audiences/schema.ts:94,119,141`) — good. Two structural limits:
1. `audienceExperienceDecisions.verifiedUserId` is `notNull` (`:100`), so **anonymous personalization is impossible by design**. The largest traffic cohort cannot be targeted.
2. A decision row is written per served page view, so write volume scales with logged-in traffic only.
Also, attribution is explicitly observational, not causal (`PERSONALIZATION-IMPLEMENTATION-PLAN.md:12`) — reports must never be read as lift.

**Recommendation: keep.** Either publish the anonymous-subject semantics the plan defers, or record "verified-account-only personalization" as a deliberate product boundary so it stops reading as an unfinished gap.

---

## D15 — Documentation system: Docusaurus + Diátaxis; dated docs retained as history

**Verdict: Partially followed.**

**Evidence.** `apps/docs` exists with a correct Diátaxis taxonomy and **58** md pages; ADR-0001…0011 live there. `docs/` holds **248** md files across 29 dated directories. But `docs/` contains **zero** `ADR-*` files — the ADR registry lives only in the Docusaurus tree, while a later decision (`docs/2026-10-08/INVENTORY-TRANSACTIONAL-LOCK-ADR.md`) was filed as a dated doc instead.

**Gap.** The registry stopped at 2026-09-14. Decisions since — audience/experience, order operations, inventory transactional locking — were **not** recorded as ADRs.

**Recommendation: keep, close the loop.** Require every new decision to land as an `apps/docs/docs/decisions/ADR-*` file, and migrate the 2026-09-26 / 2026-10-* decisions into that registry.

---

## Cross-cutting: what the decision set reveals

Of 15 recorded decisions: **8 followed** (D2, D7, D8, D9-form, D10, D12, D13, D14), **5 partially followed** (D1, D3, D4, D11, D15), **2 abandoned** (D5, D6).

The two abandoned decisions were both **deliberately superseded under load** and never reconciled back into `ARCHITECTURE_DECISIONS.md` — which is the same failure mode the documentation audit quantified, and the reason that file carries a stale banner it does not deserve to carry alone.

Three decisions (D8, D10, D14) show the pattern that works: a decision is recorded, then the code is written *to* it, and later work extends rather than contradicts it. Three decisions (D3, D5, D12) show the pattern that fails: the decision is recorded as a stated goal ("PII never touches the API server", "in-memory for Phase 0", "tenant components are isolated") and the goal is never enforced by anything, so the code drifts and the doc becomes a liability rather than a constraint.
