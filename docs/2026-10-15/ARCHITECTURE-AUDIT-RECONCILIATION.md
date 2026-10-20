# Architecture Audit — Reconciliation Status

**Date:** 2026-10-15 (America/New_York)
**Baseline (audit):** `docs/2026-10-10/architecture-audit/00-EXECUTIVE-SUMMARY.md` and reports 01–07, commit `4334196`
**Verified tree:** HEAD `46c759a`, worktree clean (0 uncommitted files)
**Method:** three independent read-only re-verifications (one per report cluster), each instructed to
re-read the cited files at current HEAD rather than trust the reports, plus first-party findings from
the release-verification work in this session.

This document answers three questions the 2026-10-10 audit cannot answer about itself:

1. Which of its findings are **actually resolved** in the tree (with the commit that did it)?
2. Which are **still present**, and did any get *worse*?
3. What did the audit **miss** that later work surfaced?

It deliberately does not soften "resolved" into "improved". A finding is `FIXED` only when the cited
failure mode is gone from the current code, not when adjacent code was touched.

---

## 1. Verdict at a glance

| Report cluster | Fixed | Partial | Still present | Not re-verified |
|---|---|---|---|---|
| 05 — scalability / security / runtime (17 risks) | 11 | 4 | 2 | 0 |
| 03 — package conformance | 0 | 1 | 14 | 1 |
| 04 — UI spec conformance | 0 | 0 | 16 | 2 |
| 01 / 02 / 06 — docs & hygiene | 6 | 1 | 5 | 0 |

**Headline:** the commits since the audit were auth, edge, tenancy, analytics and shutdown hardening
from the release-verification effort. They fixed six of the seventeen report-05 risks and **did not
touch a single report-03/04 conformance violation**; two violations measurably widened. Subsequent work
recorded below left report 05 at **11 fixed / 4 partial / 2 still present**. The four partials are
partial for one reason each, and each of those reasons is architectural: **S7** needs an
outbox, **S11** needs durable out-of-band hook execution, **S12** needs a ClickHouse sink, and **S16**
needs a metrics SDK with instrumentation points. **S14** is now fixed outright — duplicate webhooks,
SSE audience leakage and the settings-cache race all closed — and its collab relay needed no change
(§5.15).

**Still the single most urgent item, unchanged since the audit:** `WORKER_SERVER_SECRET` is committed
and unrotated (§5.1).

---

## 2. Report 05 — resolved (6 of 17)

Each row was independently re-read at HEAD. Evidence is `file:line` at `46c759a`.

| # | Risk | Fix commit | Evidence at HEAD |
|---|---|---|---|
| S1 | Cross-tenant document read via unscoped `findDocumentById` | `847fbf0`, `f01368d` | `orgId` is the first parameter of all five adapter methods; every statement filters `and(eq(documents.orgId, orgId), eq(documents.id, id))`. Service layer re-checks and fails closed: `content.service.ts:78-84` (`findById`), `:180-183` (`resolve`) return `null` on org mismatch. Regression test added. |
| S2 | Forged unsigned JWT yields permissions on public capability routes | `646b90e`, `a9799d0`, `c365ea5` | Origin now verifies signature via JWKS: `auth/jwt/verify.ts` (new), `verified-token.ts`, `zitadel/jwks.ts`; `guards.ts:42-45` rejects an unverified payload. On public routes a *presented* credential must validate before HMAC signing (`proxy.ts:107-112`). The wildcard `urn:zitadel:iam:org:projects:roles` claim is no longer accepted; project-id fallback is opt-in and forced off when `NODE_ENV=production` (`roles.ts:41-47`). Regression tests `4e48dc0`, `2d49865`. |
| S4 | ClickHouse outage gates process boot | `21e4940` | `analytics/index.ts:15` calls `void startClickHouseEnsure()` — background retry (`clickhouse.ts:141-165`, `CLICKHOUSE_ENSURE_*`), `createAnalyticsDomain` no longer blocks. Readiness surfaced on `/health` as `analytics.{ready,attempts,lastError}`. |
| S5 | Analytics ingest at-most-once, flush errors swallowed | `ed2838f` | `analytics/worker.ts:26-37` ingests inside the job and awaits; errors propagate instead of being recorded to a span and dropped. `queue.ts:12-13` sets `attempts: 5`, exponential backoff, `removeOnFail: {count: 100}`. |
| S6 | API had no `SIGTERM` handling | `cee20da`, `1b7c8c7` | `server/src/index.ts:65-106`: `SIGTERM`/`SIGINT` drain — `server.close()`, `closeAllConnections()`, WSS, `closeAllBullmqQueues()`, tracing, forced exit after `SHUTDOWN_TIMEOUT_MS`. `listen-with-retry.ts` retries `EADDRINUSE` instead of throwing. |
| S13 | `trackBatch` awaited one Redis round-trip per event | `5447ca2` | `analytics/service.ts:69-76` uses a single `queue.addBulk`. |

### 2.1 Partial (1)

| # | Risk | Status | Detail |
|---|---|---|---|
| S16 | No metrics or readiness; `/health` always 200 | **Partially fixed 2026-10-15.** `/ready` now exists and can fail: it gates on the database and on the draining flag, while reporting Redis/ClickHouse without gating on them (both degrade a capability without stopping this replica serving — the same reasoning that keeps `/health` always-200). `/metrics` is a Prometheus text scrape target covering readiness, draining, uptime, per-subsystem Redis fan-out, and ClickHouse readiness. | **Still absent: a metrics SDK and instrumented counters** — `/metrics` is a pull snapshot of signals the process already tracked, deliberately without adding a subsystem. See §5.11, including the allowlist change the endpoints needed. |

### 2.2 Still present (10)

Re-read at HEAD; none of these files were touched by any commit since the audit.

| # | Risk | Evidence | Note |
|---|---|---|---|
| S3 | Real `WORKER_SERVER_SECRET` committed | `.dev.vars` tracked (blob `ee479708`); same value in `.env` and `AUTH.md:72,81`; fingerprint `a4d59153` | See §5. |
| S7 | Event bus at-most-once, no replay, errors swallowed | **Partially fixed 2026-10-15.** Error handling fixed first (§5.8). Then the replay half: machine transitions are now **at-least-once**. `commitTransition` already wrote the transition row *inside the same transaction* as the state change, so the durable event record always existed — nothing could tell which rows had been delivered. `machine_transitions` gained `published_at` (plus `org_id` and `revision`); the live path marks it after a successful publish; a relay re-publishes rows that stay unmarked. Proven end-to-end: clearing the marker on a real transition made the relay re-publish it and a webhook delivery row appeared with the correct occurrence-unique id. | **The other ~30 publishers stay best-effort by design** — they are cache/SSE notifications, not facts a consumer depends on (§5.16). Duplicate dispatch across replicas is possible and harmless for idempotent consumers. |
| S8 | Redis fan-out health can never report degraded | **FIXED 2026-10-15.** Liveness is driven by the connections' own `ready`/`error`/`close`/`end` events instead of `publisher !== null`. One finding, **three** sites — `event-bus`, `sse-manager` and `collab-redis-relay` all had it identically; all three now use `shared/redis-fanout.ts`. | Verified live: stopping Dragonfly flipped all three to degraded in 4s and restarting recovered them in 2s. Neither direction worked before. |
| S9 | Redis helper silently drops TLS/username/db | **FIXED 2026-10-15.** `getRedisConnection()` now derives the whole URL: `rediss://` (or `?tls=true`) enables TLS, an ACL `username` is kept and percent-decoded, and the database index is read from the path or `?db=`. A malformed URL or a non-`redis://` scheme throws instead of silently falling back to localhost. | Three silent failures, not one: a TLS-requiring Redis was dialled in the clear, a Redis 6 ACL user authenticated as `default`, and `redis://host/2` silently became db 0 — cross-talk between datasets that looks like a healthy connection. |
| S10 | Storefront hot path: uncached tenant settings + unindexed slug scan | **FIXED 2026-10-15.** Both halves. (1) `get()` now caches per org with a 30s TTL, is invalidated in-process on `upsert` and cross-replica via `tenant_settings.updated`, and **no longer writes a default row on a miss** — a read path doing an insert per request. (2) Added the partial unique expression index `documents_store_slug_unique` on `(data->>'slug') WHERE type='tenant_settings' AND key='default'`, so the slug is an index condition rather than a filter over every tenant row. | Measured live: **40 settings reads → `idx_scan +0`** on `documents`, against a positive control of **40 uncached slug resolutions → `idx_scan +41`**. The unique index also closes a TOCTOU race the service-level check could not: the app read-then-wrote in two statements, so two concurrent claims of one slug could both pass. |
| S11 | Transition hooks run outside the transaction, inline on the request | **Partially fixed 2026-10-15.** A post-commit hook failure no longer fails the request: `commitTransition` persists first, so reporting an error told the caller the opposite of what happened. Failures are logged with full context. Hooks are **still awaited inline**, so their latency remains on the request, and they remain outside the transaction so they still cannot roll it back. | Proven end-to-end, see §5.9. |
| S12 | `flag_evaluations` unbounded; no ClickHouse sink | **Partially fixed 2026-10-15.** Retention added: a time-gated sweep deletes evaluations older than `FLAG_EVALUATION_RETENTION_DAYS` (default 30), triggered from the write path but at most once per `FLAG_EVALUATION_SWEEP_INTERVAL_MS` (default 1h) and never overlapping. Added `flag_evals_evaluated_at` because the retention predicate is `evaluated_at < cutoff` and the existing indexes lead with `flag_id`/`org_id`. The per-flag `flag.evaluated` publish is now **one event per evaluation set** — it had no subscribers at all, so each evaluated flag was costing a Redis publish for nothing. | **Still absent: a ClickHouse sink**, which is an architectural change rather than a fix. See §5.10. |
| S14 | Multi-instance hazards (SSE, collab, caches, version races) | **FIXED 2026-10-15.** Three instances fixed, one proven unnecessary. (1) `machine.transition` drove an outbound webhook from a *broadcast* event, so every process that subscribed produced its own delivery row and its own HTTP POST; the event now carries `revision`, the dedupe key is occurrence-unique, and a unique index on `(subscription_id, event_id)` collapses N processes to one delivery. (2) SSE is **topic-addressed** in the Socket.IO-rooms / Mercure sense, so an anonymous storefront stream is not a candidate for a user's notifications at all. (3) The tenant-settings cache now uses single-flight plus a per-org generation fence, so a read that raced an invalidation can no longer re-cache the value it invalidated. **Collab needed no change** — its persist path already refuses to overwrite a moved row (§5.15). | Remaining exposure is bounded, not structural: on a lost Redis invalidation a replica serves stale settings until the 30s TTL expires, which is the documented backstop. |
| S15 | Unbounded tables (idempotency, provider receipts) | **FIXED 2026-10-15.** Both tables now have reapers sharing the gated sweep (`shared/retention.ts`) with `flag_evaluations`. `capability_idempotency` rows are deleted a configurable grace period **after expiry** (default 7 days), using its existing `expires_at` index. `provider_event_receipts` had **no expiry column at all**, so an age-based delete was added, along with `provider_event_receipts_created_at_idx` — neither existing index could serve `created_at < cutoff`. | Corrected from the audit's own framing: the expiry index was already present at audit time, and `audiences` experience decisions were already bounded. The real gap was the absence of any reaper. See §5.12. |
| S17 | ~39 undocumented env vars, zero boot-time validation | `load-env.ts` added in `73207b9` normalises `.env` precedence only — it is not validation | Measured now: 72 `process.env.*` references across server+worker `src` vs 41 documented lines in `.env.example` → **~43 undocumented**, up from ~39. The only fail-fast guard is inline for `DATABASE_URL` (`bootstrap.ts:92-97`). |

### 2.3 How the resolved ones were re-proved

The subagent verification did not accept "a commit touched this file". For the security-relevant
fixes the check was behavioural:

- **S1** — direct Postgres proof bypassing the service guards that already checked:
  `read as owner → row`, `read as attacker org → null`, and attacker `updateDocument` / `publishDocument` /
  `archiveDocument` / `deleteDocument` all `NotFoundError`, with the owner row verifiably unmutated
  afterwards (`status=published`, no injected field).
- **S2** — reverted `proxy.ts` to its pre-fix state: the regression suite then fails on 15 routes and
  produces 31/31 passing when restored. That is a falsification test, not a smoke test.
- **S6** — a stub holding `:::3999` did **not** reproduce the port conflict, because Windows
  `SO_REUSEADDR` lets a second process bind the same port. Concurrent-process reproduction was
  impossible, so the retry logic was extracted and proved with four deterministic unit tests
  (first-try, retry-then-bind, exhaustion, non-`EADDRINUSE`). Recorded because the *integration* test
  cannot be trusted to fail if the logic breaks.

---

## 3. Reports 03 + 04 — conformance: nothing fixed, two widened

All 30 re-verified conformance findings are **still present**. This is the least-improved cluster and
the one the audit ranked as its highest-count finding area.

### 3.1 Special-attention items

| Finding | Status | Evidence |
|---|---|---|
| `verticals` declares `@noname/server` | **PARTIAL** | `packages/verticals/package.json` still lists `"@noname/server": "workspace:*"`; `tsconfig.json` still aliases `@noname/server/*` → `../server/src/*`. Source is clean — zero such imports in `verticals/src`; only a comment at `commerce/capabilities.ts:331` stating the dep must not exist. **An illegal manifest edge that the code contradicts in a comment.** |
| Cart logic in `machines/routes/instances.ts` | STILL | `CART_MACHINE` `:25`, `CLIENT_CART_EVENTS` `:27`, `/cart/start` `:72`, `/cart/:id` `:95`, `/cart/:id/:event` `:112` |
| Stripe/commerce mapping in `integrations/extension-dispatcher.ts` | STILL | `:52-57` — `COMMERCE_BACKEND_URL`, `extension: "commerce"`, `events: ["stripe/checkout.session.completed"]` |
| Cart recovery in `integrations/provider-event-worker.ts` | STILL | `:63` `recoverPersistedPaidCartProjection`; `:84-113` hardcodes `machineName !== "cart"`, `currentState !== "paid"`, `context.paymentRef` |
| `auth/scope/*` reads `documents` tables directly | STILL | `bindings.ts:1,3`, `collections.ts:1,3`, `helpers.ts:2,6`, `teams.ts:1-2` — all import `drizzle-orm` + `../../documents/schema` and query directly |
| Stripe / googleMail SQL inside `documents/adapters/postgres.ts` | STILL | `:92-93` — `data->'integrations'->'stripe'->>'connectionId'`, `->'googleMail'` |

### 3.2 Newly measured degradation

| Finding | Status | What changed |
|---|---|---|
| Client layering inversion: `core/actions/*` imports `admin/*` | **WIDER** | The report named 3 files. It is now **8**: `core/actions/{analytics,audiences,content,flags,layout,replay,routing,traces}.ts`. The inversion is spreading, not static. |
| R2 label `.default()` concentration in `commerce/catalog-schemas.ts` | **WIDER** | 56 `.default(` occurrences at HEAD (audit said ~45 at `:31-87`). The violation is actively growing. |

### 3.3 Unchanged spec gaps (report 04)

`TracesAdmin` registered+routed+seeded but schema-less (`admin/registry.ts:24,78`); `/admin/settings/traces`
unreachable from nav (`demo-labels.ts:5-29` — 5 nav + 7 settings + 3 observability, no traces);
`EditorSaveBar` registered with no schema (`editor/registry.ts:33`); `ADMIN_PALETTE_EXCLUDED_TYPES`
stale by 5 (`admin-palette-excluded.ts:2-22`); seed `providers: ["google"]` never reaches the reader's
`providerList` (`demo-specs.ts:53` vs `LoginForm.tsx:78`); `merchant` vocabulary in a platform component
(`WebhookSubscriptionsAdmin.tsx:321`); `as never` at both registry boundaries (`platform/registry.ts:12`,
`editor/registry.ts:44`); `execute` in `useEffect` dep arrays at four admin sites
(`AgentsAdminForm.tsx:156` plus a 2s `setInterval` at `:152-154`; `AudiencesAdmin.tsx:181` and `:216`;
`TracesAdmin.tsx:121`); 12/12 fetch-in-component sites intact.

The orphaned duplicate catalog (`catalog.ts`, `component-schemas.ts`, `components/index.tsx`) still exists.

### 3.4 Enforcement gap (the reason §3 exists)

Report 03 §11 / 04 §10 recommended architecture tests; report 06 §7 recommended CI. Neither landed.
Verified now: no `.github/` directory, no CI config of any kind in tracked files, no
`architecture.test.ts`, no `catalog-conventions.test.ts`.

**This is why §3 is a list of 30 unchanged findings rather than a shrinking one.** Without a gate,
nothing prevents a 31st commit from widening the inversion again — and the two "wider" rows above show
that is already happening. The audit's own rule applies: *do not add new architectural rules until
Phase 1 enforcement lands.*

---

## 4. Reports 01 / 02 / 06 — hygiene: six resolved

| Finding | Status | Evidence |
|---|---|---|
| Dead second HMAC verifier `shared/tenant.ts` | **FIXED** | Deleted, untracked — `93b62da`. It was registered nowhere, only warned on a missing signature, and read an `x-tenant-id` header the worker never sets. |
| Root scratch files (`key`, `console-*.log`, `stripe_events*.log`) | **FIXED** | Removed by `4334196`; the gitignored repo-root `key` (2.8 KB, plaintext token equal to `OPENAI_API_KEY`) deleted from the filesystem. |
| `.dsh/skills/*` + `kilo.json` tracked | **FIXED** | Untracked — `3405a38`. `kilo.json` had embedded an absolute machine path. Files remain on disk so skills still load. |
| `.gitattributes` | **FIXED** | Added with `23757ed`; blobs normalised to LF. |
| `.kilo/` ignored | **PARTIAL** | Now in `.gitignore:91` and `git check-ignore` hits — but the worktrees remain on disk (§5.3). |
| `REQUIRE_EDGE_HMAC` dropped | **FIXED** | `0c30821`. |

**Still present in this cluster:** `.dev.vars` tracking and the `AUTH.md` copies (§5.1); no CI (§3.4);
`docs/2026-07-04/ARCHITECTURE_DECISIONS.md` wrong counts (`:208` "Two packages: server + cli" vs **12**
packages + `apps/docs`; `:94` `content_entries` + `layouts`; `:56`/`:207` in-memory event bus);
`README.md` quick-start wrong (`:131` "9 DDD domains" vs **17** verified; `:121` ClickHouse "8123/9000" —
the page contradicts **itself**, because `:123` correctly assigns 9000 to the S3 emulator and ClickHouse
native is 9001; `:39` dangling "do step 7"; `:27` 6-service infra list); orphan `packages/cli`
(`src/index.ts`, 42 lines, zero functional references).

Note the pattern: the hygiene cluster was fixed where the fix was a **deletion** (dead file, scratch
logs, tracked harness state) and not fixed where the fix was **rewriting prose** (README, ADR) or
**adding infrastructure** (CI). Deletions are cheap and unambiguous; the rest needs a decision.

---

## 5. New findings — not in the audit

### 5.1 Corrections to the audit's own findings

- **S15 was mis-stated.** The audit implies the `expires_at` index is missing; it was already present.
  The real gap is that nothing deletes expired rows. Stated correctly, the fix is a reaper, not a schema
  change — a different and cheaper task than the report implies.
- **S16 is partially resolved and now documented as intentional.** Never-200 `/health` is a deliberate
  choice with a comment, not an oversight. It should be closed as "accepted design" rather than carried
  as an open risk, otherwise it will be re-triaged every audit.

### 5.2 Definition drift — a failure class the audit never examined

Found during release verification, and the reason earlier "verified" claims in this repo were not real:

The stored `machine_definitions` row for `cart` contained only 4 states
(`paid, active, payment_failed, awaiting_payment`) while the code's `cart.json` declares 9 and emits
`REFUND_ORDER` / `REFUND_CONFIRMED` / `REFUND_FAILED`. **Code is the source of truth, but the DB row is
only ever synced by re-running the seed.** Between seeds, the two diverge silently, and the divergence
is invisible until an operator action fails at runtime.

Consequence: `commerce.orders.cancel` / `.fulfill` / `.refund` could not succeed through the real path
at all. Earlier "verification" of those capabilities had been performed with direct SQL against the
tables, bypassing the machine layer — so the tests passed while the actual capability was unreachable.
Re-seeding (`pnpm seed:demo:commerce`) restored agreement, after which a real end-to-end call through
the edge returned `200 {"status":"cancelled","revision":2}` for the first time.

**This is a systemic finding, not a one-off:** there is no check that stored definitions match the code
definitions they were generated from. Every machine-based capability is exposed to it. A boot-time or
CI assertion comparing `machine_definitions` rows against the JSON definitions would close the class.

### 5.3 The secret existed in three places on disk — **third one removed 2026-10-15**

- `packages/workers/.dev.vars` — tracked at HEAD (blob `ee479708`), value fingerprint `a4d59153`
- `docs/2026-07-13/AUTH.md` — the same value, twice (`:72`, `:81`); a third occurrence at `:112` was removed
- `.kilo/worktrees/{brick-legume,positive-marjoram}` — each contained its own `.env`/`.dev.vars` copies
  (2 and 3 env files respectively, `.dev.vars` present in both). **Now removed** (`ece5b14`).

Ignoring `.kilo/` had stopped the tracking but did not remove the copies, so the secret-revival path
report 06 warned about persisted on the filesystem — and those worktrees were the exact artifact a later
`git add -A` or a well-meaning "let me check that other worktree" would have resurrected. Both worktrees
were removed **only after verifying nothing unique would be lost**: `positive-marjoram` was already merged
into `main` and `brick-legume`'s detached HEAD (`2ee63c6`) was reachable from `main`. Removing them too
early would have silently dropped two branches of real work.

The `.kilo/` ignore entry is deliberately **kept**, with a comment saying why: that path is exactly where
the `.dev.vars` copies leaked from, so a future reinstall of a worktree tool must not become trackable.
The `kilo.json` entry was dropped since the file is gone.

They were also full stale checkouts of this repo (each contained its own
`docs/2026-07-04/ARCHITECTURE_DECISIONS.md` and the rest of the tree), so an agent or a person searching
the workspace by filename could read an out-of-date copy of a doc and mistake it for the current one.

### 5.4 A regression that the suite had encoded as correct

While hardening the edge, credential forwarding was narrowed on public routes. That broke **every**
actor-authenticated capability — `denyUnless` → `requireActorPermission` → `requireAuthenticatedUser`
requires an access token, so the whole Orders surface returned 401. The important part: the regression
test **asserted the broken behaviour** (`Authorization` absent from the forwarded request), so the suite
was green while the feature was down. Reverted in `40364d4`, and the test was rewritten to assert the
real invariant.

Lesson that generalises beyond this incident: a test that encodes an implementation detail as a
requirement will actively defend a bug. The forged-credential test (`4e48dc0`) is written the other way —
it asserts the *property* (forged claims never become identity) rather than the mechanism.

**Correction (2026-10-15).** An earlier draft of this section claimed
`packages/server/src/shared/shared.test.ts:5` is racy, asserting a "scheduling accident" because
`publish` is fire-and-forget. That was wrong and is retracted here rather than quietly deleted.
`publish` awaits `dispatchLocal`, which awaits each handler, so the assertion *is* deterministic and
correct. The observed failure was a **timeout**, not a failed assertion: the test's dynamic
`await import("./event-bus")` pulls in ioredis, and under full-suite load (import time measured in
hundreds of seconds) the whole test exceeded its 5s budget and never reached the assertion. It passes
3/3 in isolation and passed on the next full run (**744/744**). The real issue is an import-cost
sensitivity in a 5s default timeout, not a race and not a design smell in the test's logic — and it is
a good argument for measuring rather than reasoning to a satisfying story.

A second instance of the class described above *does* exist, but it was found in the collab relay
tests rather than here: they asserted `isCollabRelayActive()` immediately after init, and once
liveness became readiness-based the fake had to emit `ready` for those tests to keep exercising the
real path instead of passing against a no-op publish.

### 5.5 Line endings made the lint gate unfixable, and the loop was invisible

`biome check` failed on `proxy.ts` and `index.ts` with no actionable diff. Root cause:
`core.autocrlf=true` with no `.gitattributes` — `git checkout` wrote CRLF, biome requires LF, but git
normalises on compare, so the working tree looked clean and the same two files failed forever. Proved by
measurement: 91 of 236 lines CRLF → exit 1; normalised → exit 0. Fixed by normalising the blobs and
adding `.gitattributes` (`23757ed`).

### 5.6 Analytics durability fix has a throughput cost — **FIXED 2026-10-15**

`ed2838f` correctly made ingest awaited-inside-the-job, but removed the batching that previously
existed: `analytics/worker.ts` ran one job and one ClickHouse insert per event (`batch_size` hardcoded
to 1). A 100-event browser batch became 100 jobs and 100 inserts. Correctness improved; write
amplification regressed.

Restored by batching at **enqueue** time rather than with an in-process buffer (`queue.ts`, `service.ts`,
`worker.ts`): one job now carries a chunk of events (`ANALYTICS_INGEST_BATCH_SIZE`, default 500) and each
job performs exactly one multi-row `INSERT`. A buffer is deliberately *not* reintroduced — a buffer is
what caused the original at-most-once bug, because jobs completed while events sat in RAM. The queue is
the buffer now, so a crash loses nothing, and a batch is one statement, so it either lands or does not.

Also handled: `analytics_events` is a plain `MergeTree` with no dedup on `event_id`, so the batch size
bounds how much one retry can duplicate — worth knowing before raising the default.

There is exactly **one** job format, `{ events: [...] }`. An earlier revision of this fix also tolerated
an old bare-single-event job, on the theory that a deploy could leave one in Redis. That tolerance was
removed: nothing is deployed, so there is no in-flight legacy job to protect, and supporting two payload
shapes means two contracts, two code paths, and two ways for a producer and a worker to disagree in
silence. The rule this repo should follow while it is still pre-production — and the reason the
interfaces can be changed freely — is that a compat shim must be justified by a real deployed version,
not by a hypothetical one.

Verified live, not just in unit tests: `POST /api/analytics/track` through the edge with **1 200 events**
returned `201 {"accepted":1200}`, incremented BullMQ's job counter by exactly **3** (the counter is
race-free — it increments once per job added), and landed **1 200 rows with 1 200 distinct `event_id`s**
in ClickHouse with the queue draining to 0 failed. Probe rows were then deleted.

### 5.7 Shutdown does not drain in-process workers — **FIXED 2026-10-15**

`index.ts` called `closeAllBullmqQueues()` on `SIGTERM`, but with `RUN_WORKERS=true` (the default) the
API process also hosts every domain's BullMQ `Worker`. Closing the *queue* objects did not touch them,
so their active jobs were abandoned mid-execution on every deploy — a webhook delivery, email send or
catalog build killed after it had already started side effects. `worker.ts`, the worker-only process
where this matters most, had the same gap.

Fixed with a registry (`shared/bullmq-workers.ts`) that each `start*Worker` joins, plus
`closeAllBullmqWorkers()` called by both entrypoints **before** the queues are closed. Registration
lives in the constructors rather than at the wiring sites because the domain objects expose their
workers under inconsistent names (`worker`, `outboundWorker`, `deliveryWorker`, …) — a registry a
constructor joins cannot be forgotten when wiring changes.

The load-bearing assumption was verified rather than trusted: that BullMQ's `close()` waits for the
job in progress. A probe against real BullMQ and real Dragonfly, using its own `{hashtag}`-named queue
so no production queue was read or drained, ran a 3s job and then closed:

```text
job started: true
close() returned after 2943ms
job had completed when close() returned: true
```

Had `close()` merely stopped new work, awaiting it would have bought nothing.

Incidental finding from that probe: **a queue name without a `{hashtag}` fails on Dragonfly** —
BullMQ's own Lua scripts error with `script tried accessing undeclared key`. Every entry in
`shared/bullmq-queues.ts` has one; anything added later must too.

### 5.8 Redis fan-out: failures were invisible and could crash or hang the process

Found while fixing S7/S8, and worse than either row suggested on its own. Three things compounded:

1. **Subscriber errors were discarded.** `dispatchLocal` was `catch { /* fire-and-forget */ }`, so a
   listener could throw on every event with no log anywhere. The failure was indistinguishable from the
   event never having been published. Now logged, and the remaining subscribers still run.

2. **A failed publish could kill the process.** Most of the ~30 publish call sites use
   `void eventBus.publish(...)`, and `eventBus.publish` awaited `publisher.publish` with no catch. Node
   throws on unhandled rejection by default, and there is **no `unhandledRejection` handler** in
   `index.ts` or `worker.ts`. So a single Redis publish failure during an outage could take down the API
   instead of degrading. Publish is now best-effort: it cannot reject.

3. **A stalled publish could block a request indefinitely.** `getRedisConnection()` sets
   `maxRetriesPerRequest: null`, which makes ioredis queue commands while offline rather than fail them.
   Awaiting that from a request path means waiting for Redis to come back. Publishes are now bounded by a
   2s timeout.

Both were falsified rather than assumed: reverting the `try/catch` fails exactly the two publish-safety
tests, and reverting `dispatchLocal` to swallowing fails the visibility test while the "does not reject"
test still passes — confirming they are independent properties, not one behaviour counted twice.

Related, and **not** fixed here: many ioredis clients created through `getBullmqQueue`/`getRedisConnection`
attach no `error` listener, so during a Redis outage the logs fill with `[ioredis] Unhandled error event`
plus an `AggregateError` per retry per connection. The six connections this change owns are now quiet
(edge-triggered logging only); the rest are unchanged. Worth a follow-up, since a log flood that large
buries the one line that matters.

### 5.9 A committed transition reported as a failure, proven end-to-end

S11 was not a theoretical ordering concern. The commerce hook (`bootstrap.ts`) runs order projection,
audience attribution, analytics and a notification — and the notification throws
`NotFoundError("Notification template", templateId)` when no template is published for a trigger. The
error propagated *after* `commitTransition` had already persisted the new state.

Demonstrated against the running stack by sending an `addToCart` transition carrying a `notify` whose
trigger has no template. The same request, with only the engine's post-commit handling changed:

```text
pre-S11 behaviour:   -> 404 {"error":"Notification template not found: ..."}
                     read back -> revision=2      (the transition HAD committed)
after the fix:       -> 200
                     read back -> revision=2
```

The first case is the defect stated plainly: the API told the caller the operation failed while the
state had already changed, so the natural retry then fails on a revision conflict. The row counts
confirm the mechanism — the transition record exists and no delivery row was written, i.e. the commit
preceded the hook and the hook threw.

Two deliberate limits, so this is recorded as partial rather than fixed:

- **Hooks are still awaited inline.** Detaching them would remove their latency from the request but
  trade this bug for silent loss on crash, and callers rely on the projection being written before the
  response returns. Moving them onto a durable queue is the architectural follow-up.
- **Hooks still run outside the transaction**, so they still cannot be rolled back. Making them
  transactional would require hooks to be storage-level operations inside `commitTransition`, which is
  a port redesign rather than a fix.

`replayPersistedTransition` keeps a distinct contract: there the hook *is* the operation, so it now
returns `false` when the hook fails instead of reporting a repair that did not happen.

One honest consequence: an existing engine test asserted the old behaviour
(`rejects.toThrow("projection unavailable")`), so the suite had been defending this bug — the same
pattern as §5.4. It now asserts that the transition succeeds and that replay still repairs the
projection.

### 5.10 Flag evaluations: retention added, but the write path publishes to nobody

`flag_evaluations` is written on every flag evaluation — a per-request path — with no expiry, so it grew
without bound. Retention now bounds it, and the sweep is deliberately off the hot path: time-gated to
at most once per interval per process, never overlapping, and it cannot fail the evaluation that
triggered it.

Two things the audit's framing understated:

- **The retention predicate needed its own index.** `evaluated_at < cutoff` is not served by
  `flag_evals_flag_time` or `flag_evals_subject_time` (both lead with `flag_id`/`org_id`). Verified by
  A/B against Postgres: with `flag_evals_evaluated_at` the plan is
  `Index Scan using flag_evals_evaluated_at`; without it, `Seq Scan ... Filter`. At 617 rows either is
  fine, which is precisely why this had to be measured rather than assumed — at scale the difference is
  a full scan per sweep.
- **`flag.evaluated` has no subscribers anywhere in the codebase.** The audit called the per-flag
  publish the untouched half of S12; it is worse than that. Since `eventBus.publish` also fans out to
  Redis, every flag evaluated on every request cost a Redis publish for an event nothing consumes.
  **Now batched** to one event per evaluation set (`evaluations: [...]`). This changes a published
  contract — safe only because nothing consumes it — so a future consumer must expect the array shape.

Also worth recording before anyone enables retention in an existing environment: the default 30-day
window is **not inert**. In this database the oldest evaluations are 32 days old, so the first sweep
would delete 93 existing rows. That is what retention means, but it should be a deliberate choice.

Verified live against real Postgres and the real adapter: with a 100-day window and a probe row
backdated 200 days, the sweep removed exactly that one row, left the current probe row in place, and
left all 93 real older-than-30-days rows untouched.

### 5.11 Readiness and metrics — and the allowlist they needed to be reachable at all

S16 is two findings in one. `/health` returning 200 unconditionally is a deliberate *liveness* choice
(a replica whose Redis fan-out degraded is still serving), and that reasoning is sound. What was
missing is the other half: something an orchestrator may act on, and a scrape target for alerting.

`/ready` was therefore made to gate on hard dependencies only — the database, and a new draining flag
— while Redis and ClickHouse are reported but do not gate, for the same reason `/health` doesn't.
Draining matters on its own: without it a load balancer keeps routing to a replica that has already
called `server.close()`, turning every deploy into a window of failed requests. `index.ts` now calls
`beginDraining()` before anything else on SIGTERM/SIGINT.

`/metrics` is a Prometheus text target covering readiness, draining, uptime, per-subsystem Redis
fan-out and ClickHouse readiness. There is deliberately **no metrics SDK and no new instrumentation** —
that would be adding a subsystem, and the honest fix for "no scrape target" is to expose what the
process already tracks. Counters (for example post-commit hook failures) would need instrumentation
points and remain absent.

Two things found by testing rather than reasoning:

1. **Both endpoints were unreachable at first.** `orgMiddleware` bypasses only `/health`, so `/ready`
   and `/metrics` returned `401 {"error":"Request must come through edge worker"}`. An orchestrator's
   probe and a scraper run inside the network and cannot produce the edge's HMAC, so requiring it would
   leave every replica permanently reported unready. Both are now in the bypass list — read-only,
   operational state only, and not routed by the edge.
2. **The first `/metrics` output was not parser-safe.** `HELP`/`TYPE` were emitted per labelled sample,
   which a strict Prometheus parser rejects with "second HELP line for metric name" — the whole scrape
   fails, so the endpoint would have looked fine by eye and been useless in practice. The renderer now
   groups by metric family, and a test asserts one `HELP`/`TYPE` per family with one sample per
   subsystem. Verified against the live endpoint: 8 families, no duplicate `HELP` lines.

### 5.12 Three unbounded tables, one gate, and the semantics each deletion gives up

S15 was already the most accurately-framed finding in the report: the `expires_at` index existed and
the gap was genuinely "nothing deletes rows". `provider_event_receipts` was worse than the report
implied — it has **no expiry column at all**, so nothing marked a receipt as eligible for removal even
in principle.

With `flag_evaluations` from S12 that made three tables sharing one problem, so the gate — interval,
non-overlap, never failing the caller — was extracted to `shared/retention.ts`. The flags tests that
already pinned those semantics are what made the refactor safe: they passed unchanged against the
shared implementation.

**A retention window is a semantic choice, not housekeeping**, and each one here gives something up:

- `capability_idempotency` — rows are deleted a grace period **after expiry** (default 7 days), not at
  expiry. An expired row is not inert: `claim` returns `conflict` when the same key arrives with a
  different request hash *before* it considers expiry, so deleting at the moment `expires_at` passed
  would silently turn that conflict into a fresh claim. The grace keeps the key's binding behaviour
  intact well past the 24h idempotency window.
- `provider_event_receipts` — a receipt existed only to answer "have I seen this event key before?",
  and was kept **forever**. Deleting it also deletes the proof its event was handled, so the dedup
  window shrinks from forever to the configured period (default 30 days). Providers redeliver within
  hours or days, so that sits far outside any retry they perform — but it is a change in behaviour, not
  just disk usage.
- `flag_evaluations` — full history was available before; now only the retention window is.

Two index findings, and the contrast between them is the point:

- Receipts needed `provider_event_receipts_created_at_idx`. Neither existing index leads with
  `created_at`, so the sweep would have scanned the table it exists to shrink. Verified usable by
  forcing the planner (`SET enable_seqscan = off` → `Index Scan using
  provider_event_receipts_created_at_idx`); at four rows Postgres correctly prefers a sequential scan
  anyway, so this is "available and usable", not "demonstrated at scale".
- Idempotency needed nothing: its existing `expires_at` index already serves the predicate
  (`Bitmap Index Scan on capability_idempotency_expires_at_idx`). The audit was right about that, and
  it is worth noting that `flag_evaluations` at 617 rows chose its index unaided while these two at
  4 and 14 rows did not — which is why the claim had to be measured per table rather than generalised.

Also worth recording before anyone enables these: like the flags window, they are **not inert**. A
first sweep in this database would delete 3 real receipts and 11 real idempotency rows. That is what
retention means, but it should be a deliberate choice rather than a side effect of deploying.

Verified live against real Postgres and the real stores: with 100-day windows and probe rows backdated
200 days, each reaper removed exactly its own expired probe, the current probe survived, a
`claim()`-triggered sweep also fired correctly, and the 3 real receipts and 11 real idempotency rows
were untouched.

### 5.13 A broadcast event driving a global side effect — duplicate webhooks, proven with two replicas

This is the root cause behind part of S14, and it was found by asking what the *actual* defect was
rather than which pattern to add.

`eventBus.publish(MachineEvents.TRANSITION, …)` fans out to Redis and every process that subscribed
handles it. `bootstrap.ts` registers the outbound webhook router **unconditionally in `createApp()`** —
not gated by `RUN_WORKERS` — so every API replica *and* the worker process subscribed. One committed
transition was therefore handled once per process: N delivery rows and N HTTP POSTs to the customer.

Broadcast semantics are correct for per-replica state (local caches, SSE fan-out to connections a
replica owns). They are wrong for a **global side effect** like a customer webhook, which must happen
once. The fix keeps the broadcast and makes the global effect idempotent, because the alternative —
electing one replica to handle it — adds coordination to a path that has none.

Two details decided whether this could work at all:

- **The old dedupe key was not usable.** `org:instance:event:toState` is occurrence-insensitive: two
  `addToCart` calls produce the same key, so adding a unique index on it would have *suppressed a
  legitimate repeat delivery* — trading duplicates for missing events. `revision` increments per
  committed transition, so it is now carried on the event and the key is `org:instance:revision`. When
  `revision` is absent the router falls back to a random id: failing open risks a duplicate, while a
  colliding key would drop a real delivery, and a lost customer webhook is the worse failure.
- **`ON CONFLICT` is not a no-op without the index.** Dropping the unique index while leaving
  `onConflictDoNothing` makes Postgres reject the statement ("no unique or exclusion constraint
  matching the ON CONFLICT specification"), which silently produced *zero* deliveries rather than
  duplicates. That is why the counterfactual below had to revert the code as well as the index.

Proven with two live replicas (second on `:3101`, `RUN_WORKERS=false`), one transition, counting both
delivery rows and enqueued outbound jobs:

```text
fixed build:          delivery rows: 1   enqueued outbound jobs: 1   PASS
pre-fix code, no idx: delivery rows: 2   enqueued outbound jobs: 2   PASS (the bug, reproduced)
fixed build again:    delivery rows: 1   enqueued outbound jobs: 1   PASS
```

The HTTP POST itself was not observed: the outbound worker requires a per-subscription signing secret
and the subscription route rejects non-HTTPS URLs, so a local sink cannot be used without mutating
secrets. One row plus one job implies one POST, since the worker issues exactly one per job — that step
is inference, not measurement.

Worth noting for anyone touching this later: `addToCart` is a self-transition, and the engine rejects a
transition that changes neither state nor context (`engine.ts:150`). Params are merged into context, so
an empty body is rejected while a non-empty one succeeds.

### 5.14 SSE audiences: adopting topic addressing instead of payload filtering

The SSE leak was not a missing check — it was the wrong delivery model. Fixing the check would have left
the same class of bug one predicate away, so the model was replaced with the one every mature
implementation uses.

**The established pattern.** [Socket.IO rooms](https://socket.io/docs/v4/rooms/) answers "broadcast to
each device/tab of a given user" with `socket.join(userId)` then `io.to(userId).emit(...)`; its adapter
keeps `rooms: Map<Room, Set<SocketId>>` and delivery is a room lookup. [Mercure](https://mercure.rocks/spec),
the SSE-native standard, separates the two concerns explicitly: "routing … is independent of
authorization … the query parameters never grant access to private updates", and a private update "MUST
NOT" be dispatched to a subscriber not authorized to receive it. In both, **the recipient is a property
of the subscription, not a predicate over the payload.**

**What we had.** `broadcast(orgId, data)` fanned out per org and then filtered on `data.userId` at
delivery. The guard was `if (targetUserId && entry.userId && entry.userId !== targetUserId) continue`,
so an entry with **no** userId — the anonymous storefront stream, whose ticket is minted with an empty
userId — was never skipped. A per-user `comms.inbox` payload (title and body) therefore reached every
anonymous storefront visitor of the org.

**What replaced it.** `subscribe(topic, stream)` / `broadcast(topic, data)` with topics derived from the
authenticated ticket:

- `org:{orgId}/flags` — the anonymous storefront stream
- `org:{orgId}/user:{userId}` — one user's notifications, org-scoped so ids cannot collide across tenants

Only the route chooses a topic, never the client, which makes the subscription itself the authorization.
Delivery is one map lookup with no payload inspection, and the tests assert routing *ignores* the
payload's `userId` — so a regression cannot reintroduce filtering subtly.

**One deliberate asymmetry.** A fan-out message arriving without a `topic` is dropped rather than
broadcast. The alternatives are both worse: broadcasting would deliver a per-user notification to every
subscriber (the leak, restored), while dropping it costs at most one event during a mixed-version
rollout. Failing closed on a security boundary is the correct direction.

Verified live: a header-authenticated flags stream connects (200), a flag change is created, and the
stream receives exactly `{"key":"…"}` — no notification payload. Falsified by removing topic scoping
(deliver to all subscribers): four tests fail, including the leak and the cross-tenant case.

**Superseded on purpose.** An intermediate version of this change introduced a `channel` enum plus a
fixed predicate. That was a half-step: it stopped the leak but kept delivery payload-driven. The enum was
replaced by topics, per the pattern above.

### 5.15 Two root-cause passes that changed the plan (and one that said "do nothing")

Recorded because the value was in *not* writing code.

**Collab persistence — no fix warranted.** I had claimed concurrent `Automerge.save()` writes to one key
could lose ops (last-writer-wins). Reading `persistRoom` shows the standard guard already exists
(`layout-room.ts:150-166`): if the collab doc differs from its baseline *and* Postgres has also moved, it
**refuses to write** and reimports from Postgres instead, then lets the next real edit persist against
the fresh baseline. The stored artifact is the derived spec, not the CRDT binary, and the live docs merge
relayed snapshots (`Automerge.merge`). A residual convergence window remains — inherent to multi-writer
CRDT persistence without a single designated writer — but there is nothing here to fix, and changing it
would have been churn.

**Settings cache — the remaining S14 race, now fixed.** `get()` on a miss wrote the database result
back unconditionally, so an invalidation arriving *inside* that await was undone: the read had observed
the old row and the write-back re-cached it, leaving a rotated `publishableKey` served for the full 30s
TTL despite the eviction that had just happened.

The fix is the two standard mechanisms, not a bespoke one:

- **Single-flight**, as in Go's [`singleflight`](https://pkg.go.dev/golang.org/x/sync/singleflight):
  "only one execution is in-flight for a given key at a time … duplicate caller waits for the original
  to complete". Concurrent storefront misses for a cold org now share one read.
- **A generation fence** that discards a fill which raced a write — the "stale set" protection
  Facebook's memcache leases introduced (*Scaling Memcache at Facebook*, Nishtala et al., NSDI '13 —
  cited as a named reference; I did not fetch the paper). Every invalidation bumps the org's
  generation, and a fill only stores if the generation it started with is unchanged.

Two false starts, both caught by falsification rather than by reading:

1. The first version of the test **passed with the fence removed**. `upsert` fires
   `void eventBus.publish(...)`, so this process's own invalidation echo landed *after* the stale
   write-back and deleted the poisoned entry — masking the race. The test now lets the echo settle
   before releasing the stale read, and then it fails without the fence (`expected 'stale' to be
   'fresh-slug'`).
2. The two-replica probe first reported "B never saw the update". It was not the cache: A could not see
   its own write either. `toTenantSettings` **whitelists** the SEO keys, so a custom marker field was
   silently dropped on read. Using `metaTitleTemplate` (whitelisted) made the probe valid: B saw the
   update and followed the restore.

Honest scope: the two-replica test proves the **invalidation path** end-to-end; the fence itself is a
single-process interleaving, so it is proven by the unit test plus falsification, not by the E2E.

Residual, documented rather than hidden: if the invalidation publish is lost, a replica serves stale
settings until the 30s TTL — that is the purpose of the short TTL, since `publishableKey` authenticates
public actors.

### 5.16 Durable event delivery without an outbox table — the log was already the outbox

S7 was the item I had repeatedly described as needing "a transaction boundary threaded through ~30
publishers". Working through how DDD and its frameworks actually solve this showed the estimate was
wrong, and the reason is specific to this codebase.

**What the frameworks do.** [Spring Modulith's event publication
registry](https://docs.spring.io/spring-modulith/reference/events.html) writes an entry for each
transactional listener "**as part of the original business transaction**", marks it when the listener
succeeds, and republishes outstanding entries on restart — with `PUBLISHED → PROCESSING →
COMPLETED/FAILED` states, a staleness monitor, and a documented warning that without periodic purging the
registry table "will grow unbounded". It can work that way because the framework owns both transaction
demarcation (`@Transactional`) and a single publish choke point (`ApplicationEventPublisher`). Next.js
offers the opposite lesson: [`after()`](https://nextjs.org/docs/app/api-reference/functions/after) is
documented for "side effects that should not block the response, such as logging and analytics" — no
transaction, no durability.

**What we already had.** `commitTransition` opens `db.transaction` and writes **both** the aggregate and
its `machine_transitions` row inside it. That is a unit of work persisting an aggregate with its domain
event — the property DDD requires and the outbox exists to obtain. The transition log is append-only, and
`replayPersistedTransition` already read it to repair missed projections.

So the missing piece was never the durable record. It was **the marker**: nothing could distinguish "this
row's event was delivered" from "this row's event was lost". Adding `published_at` (plus `org_id` and
`revision`, so a replayed row carries a complete payload) turned the existing log into a publication
registry. The relay then republishes rows that stayed unmarked — the same shape as Spring Modulith's
resend, without a parallel table that could drift from the state it describes.

**The migration hazard, which I hit for real.** Existing rows had `published_at = NULL`, so the relay's
first pass treated the entire history as undelivered and republished 28 transitions. It was harmless here
— there were no webhook subscriptions, so the consumer had nothing to do — but the lesson is not
optional: **mark pre-existing rows as published before starting the relay**, or the first deploy fires
every historical event at every subscriber. The migration is:

```sql
update machine_transitions set revision = null where published_at is null;      -- history never recorded it
update machine_transitions set published_at = created_at where published_at is null;
```

and `revision` is deliberately nulled rather than backfilled from the instance's *current* revision,
because a per-row value taken from current state would be a plausible-looking lie. Historical rows carry
no revision; only rows written from now on are complete.

**What this deliberately does not do.** Only machine transitions are durable. The other ~30 publishers
(cache invalidation, SSE nudges, asset/page notifications) stay at-most-once, because they carry
notifications rather than facts and DDD's boundary thinking says losing one costs a stale cache entry, not
a missing delivery. Making dispatch *exclusive* across replicas is also unsolved on purpose: every
worker-enabled replica runs a relay and the read is not exclusive, so two processes can publish the same
row. Consumers are idempotent (the webhook unique index from §5.13 is what makes this safe), and the
alternatives — an advisory lock on a pinned session, or claim-then-publish with a staleness reaper like
Modulith's `PROCESSING`/`FAILED` states — are a larger increment than the risk justifies today.

Verified end-to-end: a real transition wrote `org_id`/`revision` and was marked published shortly after
the response (the marker is chained off the publish, not awaited, so a request never pays for a Redis
round-trip); clearing that marker and backdating the row made the relay re-publish it within one interval,
and a webhook delivery row appeared carrying `{org}:{instance}:{revision}`.

---

## 6. Immediate actions, in priority order1. **Rotate `WORKER_SERVER_SECRET`** and purge it from `.dev.vars`, `AUTH.md:72,81`. Owner-deferred
   (Phase 0 item 0.1). Everything in §2's S2 row — both defensive layers — assumes this value is private.
   Deleting it from HEAD is **not** sufficient: it is in history and already public.
2. ~~**Delete `.kilo/worktrees/*`**~~ — **done** (`ece5b14`). Both registered worktrees, the merged
   `positive-marjoram` branch, `kilo.json` and kilo's internal `.git` state were removed after verifying
   nothing unique would be lost; the `.kilo/` ignore entry is kept deliberately as a guard (§5.3).
3. **Add CI** with the two convention tests report 03/04 specified. Without it, §3 is guaranteed to grow —
   it already did, twice, while nobody was looking.
4. ~~**Add a stored-vs-code machine-definition assertion**~~ — **done** (`5df9f3a`). Both halves landed:
   the contract test that fails when a transition the capabilities drive disappears, and the seed-time
   round-trip check that compares the stored row against `cart.json` (§5.2).
5. **Fix the README and `ARCHITECTURE_DECISIONS.md` counts** (§4). Cheap, and the audit named docs as its
   largest finding cluster; leaving them wrong means the next reader re-derives everything.

Explicitly **not** recommended yet: any new architectural rule. Per the audit's own sequencing, rules
come after enforcement (§3.4), otherwise they are unenforceable prose — which is precisely the state §3
documents.

---

## 7. Limitations of this reconciliation

- Two report-04 sub-items (account-security permission gap, Pagination name collision) and the
  `shared/*` → domains inversion were **not** re-checked line-by-line, mainly because `73207b9` touched
  the `shared/env` area. They are marked `NOT VERIFIED` rather than guessed.
- Some verification shell invocations returned truncated or garbled output in this environment. Only
  findings resting on a read/grep that actually succeeded are asserted; the rest are labelled.
- The concurrency, idempotency and pagination-boundary behaviours of the Orders capabilities were **not**
  exercised against real Postgres through the authenticated path as part of this reconciliation. The
  refund round-trip has been tested only against a fake provider proxy, never against the Stripe sandbox —
  no webhook event has ever been captured in this environment. Those remain `NOT VERIFIED` and are
  tracked in `docs/2026-10-10/RELEASE-VERIFICATION-STATUS.md`.
- The verification was performed at `46c759a`. A separate writer session has been active in this repo;
  line numbers cited here will drift as it commits, which is itself an argument for the CI in item 3.
