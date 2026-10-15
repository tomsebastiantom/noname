# Architecture Audit — Reconciliation Status

**Date:** 2026-10-15 (America/New_York)
**Baseline (audit):** `docs/2026-10-10/architecture-audit/00-EXECUTIVE-SUMMARY.md` and reports 01–07, commit `4334196`
**Verified tree:** HEAD `3625bb9`, worktree clean (0 uncommitted files)
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
| 05 — scalability / security / runtime (17 risks) | 6 | 1 | 10 | 0 |
| 03 — package conformance | 0 | 1 | 14 | 1 |
| 04 — UI spec conformance | 0 | 0 | 16 | 2 |
| 01 / 02 / 06 — docs & hygiene | 6 | 1 | 5 | 0 |

**Headline:** the 31 commits since the audit were auth, edge, tenancy, analytics and shutdown
hardening from the release-verification effort. They fixed six of the seventeen report-05 risks and
**did not touch a single report-03/04 conformance violation**. Two violations measurably widened.

**Still the single most urgent item, unchanged since the audit:** `WORKER_SERVER_SECRET` is committed
and unrotated (§5.1).

---

## 2. Report 05 — resolved (6 of 17)

Each row was independently re-read at HEAD. Evidence is `file:line` at `3625bb9`.

| # | Risk | Fix commit | Evidence at HEAD |
|---|---|---|---|
| S1 | Cross-tenant document read via unscoped `findDocumentById` | `e804b5c`, `f01368d` | `orgId` is the first parameter of all five adapter methods; every statement filters `and(eq(documents.orgId, orgId), eq(documents.id, id))`. Service layer re-checks and fails closed: `content.service.ts:78-84` (`findById`), `:180-183` (`resolve`) return `null` on org mismatch. Regression test added. |
| S2 | Forged unsigned JWT yields permissions on public capability routes | `646b90e`, `a9799d0`, `2a991c3` | Origin now verifies signature via JWKS: `auth/jwt/verify.ts` (new), `verified-token.ts`, `zitadel/jwks.ts`; `guards.ts:42-45` rejects an unverified payload. On public routes a *presented* credential must validate before HMAC signing (`proxy.ts:107-112`). The wildcard `urn:zitadel:iam:org:projects:roles` claim is no longer accepted; project-id fallback is opt-in and forced off when `NODE_ENV=production` (`roles.ts:41-47`). Regression tests `4e48dc0`, `2d49865`. |
| S4 | ClickHouse outage gates process boot | `21e4940` | `analytics/index.ts:15` calls `void startClickHouseEnsure()` — background retry (`clickhouse.ts:141-165`, `CLICKHOUSE_ENSURE_*`), `createAnalyticsDomain` no longer blocks. Readiness surfaced on `/health` as `analytics.{ready,attempts,lastError}`. |
| S5 | Analytics ingest at-most-once, flush errors swallowed | `ed2838f` | `analytics/worker.ts:26-37` ingests inside the job and awaits; errors propagate instead of being recorded to a span and dropped. `queue.ts:12-13` sets `attempts: 5`, exponential backoff, `removeOnFail: {count: 100}`. |
| S6 | API had no `SIGTERM` handling | `cee20da`, `c547ee5` | `server/src/index.ts:65-106`: `SIGTERM`/`SIGINT` drain — `server.close()`, `closeAllConnections()`, WSS, `closeAllBullmqQueues()`, tracing, forced exit after `SHUTDOWN_TIMEOUT_MS`. `listen-with-retry.ts` retries `EADDRINUSE` instead of throwing. |
| S13 | `trackBatch` awaited one Redis round-trip per event | `5447ca2` | `analytics/service.ts:69-76` uses a single `queue.addBulk`. |

### 2.1 Partial (1)

| # | Risk | Status | Detail |
|---|---|---|---|
| S16 | No metrics or readiness; `/health` always 200 | **PARTIAL** | `/health` now surfaces Redis-degraded state and ClickHouse readiness (`bootstrap.ts:76-90`). There is still no metrics SDK, no `/metrics`, no `/ready`; always-200 remains, now as a documented design choice (`bootstrap.ts:77-83`) rather than an accident. Reasonable for a sink, but it gives an orchestrator nothing to act on. |

### 2.2 Still present (10)

Re-read at HEAD; none of these files were touched by any commit since the audit.

| # | Risk | Evidence | Note |
|---|---|---|---|
| S3 | Real `WORKER_SERVER_SECRET` committed | `.dev.vars` tracked (blob `ee479708`); same value in `.env` and `AUTH.md:72,81`; fingerprint `a4d59153` | See §5. |
| S7 | Event bus at-most-once, no replay, errors swallowed | `shared/event-bus.ts:17-25` — `dispatchLocal` `catch {}`; no outbox, no consumer offset, no replay | Unchanged. |
| S8 | Redis fan-out health can never report degraded | `redis-fanout-status.ts:14-27` — `isActive` closes over `publisher !== null`, and `publisher` never returns to null after startup (`event-bus.ts:31,49`) | The health check is structurally incapable of flipping. |
| S9 | Redis helper silently drops TLS/username/db | `shared/redis.ts:1-11` | `rediss://`, username and db index are all ignored; `maxRetriesPerRequest: null` applied unconditionally. |
| S10 | Storefront hot path: uncached tenant settings + unindexed slug scan | `tenant-settings.service.ts:22-26` (no cache; writes a default row on miss); `documents/adapters/postgres.ts:61-74` scans JSONB `data->>'slug'`; `documents/schema.ts` has no slug index | One mitigation exists: `ead4f56` stopped the edge poisoning its slug miss-cache when origin is down (`resolve-slug.ts:28-45` — 404 only). That narrows S10 without fixing it. |
| S11 | Transition hooks run outside the transaction, inline on the request | `machines/engine.ts:145-163` awaits `hooks.onTransitionComplete` after commit; `replayPersistedTransition` `:170-204` unchanged | A hook failure cannot roll back the transition, and it lengthens the request. |
| S12 | `flag_evaluations` unbounded; no ClickHouse sink | `flags/schema.ts:38-59` — no TTL/cleanup; `evaluation.ts:132-155` inserts per evaluation | DB insert is now batched, but `eventBus.publish` is still once per flag (`:152-154`), so half of this risk is untouched. |
| S14 | Multi-instance hazards (SSE, collab, caches, version races) | `event-bus`, `sse-manager`, `collab-relay`, cache invalidation unchanged | One sub-item is resolved as a side effect: the in-memory analytics batch that mixed tenants under concurrency is gone, because `ed2838f` removed the buffer entirely. |
| S15 | Unbounded tables (idempotency, provider receipts) | `capabilities/schema.ts:17,25` — `expires_at` field and index exist, but nothing deletes expired rows; `provider_event_receipts` has no cleanup | Corrected from the audit's own framing: the expiry index was already present at audit time. The real gap is the absence of any reaper. `audiences` experience decisions *are* bounded (`cleanupExpiredExperienceDecisions`) — the audit did not cite that precedent. |
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
| `.gitattributes` | **FIXED** | Added with `e8bdbb0`; blobs normalised to LF. |
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

### 5.3 The secret now exists in three places on disk

- `packages/workers/.dev.vars` — tracked at HEAD (blob `ee479708`), value fingerprint `a4d59153`
- `docs/2026-07-13/AUTH.md` — the same value, twice (`:72`, `:81`); a third occurrence at `:112` was removed
- `.kilo/worktrees/{brick-legume,positive-marjoram}` — **both still on disk**, each containing `.env`/
  `.dev.vars` copies (verified: 2 and 3 env files respectively, `.dev.vars` present in both)

Ignoring `.kilo/` stopped the tracking, but did not remove the copies. The secret-revival path report 06
warned about therefore persists on the filesystem — and those worktrees are the exact artifact a later
`git add -A` or a well-meaning "let me check that other worktree" would resurrect.

They are also full stale checkouts of this repo (each contains its own
`docs/2026-07-04/ARCHITECTURE_DECISIONS.md` and the rest of the tree), so an agent or a person searching
the workspace by filename can read an out-of-date copy of a doc and mistake it for the current one. Any
doc-consistency check that walks the filesystem rather than the index will double-count them.

### 5.4 A regression that the suite had encoded as correct

While hardening the edge, credential forwarding was narrowed on public routes. That broke **every**
actor-authenticated capability — `denyUnless` → `requireActorPermission` → `requireAuthenticatedUser`
requires an access token, so the whole Orders surface returned 401. The important part: the regression
test **asserted the broken behaviour** (`Authorization` absent from the forwarded request), so the suite
was green while the feature was down. Reverted in `11e894f`, and the test was rewritten to assert the
real invariant.

Lesson that generalises beyond this incident: a test that encodes an implementation detail as a
requirement will actively defend a bug. The forged-credential test (`4e48dc0`) is written the other way —
it asserts the *property* (forged claims never become identity) rather than the mechanism.

### 5.5 Line endings made the lint gate unfixable, and the loop was invisible

`biome check` failed on `proxy.ts` and `index.ts` with no actionable diff. Root cause:
`core.autocrlf=true` with no `.gitattributes` — `git checkout` wrote CRLF, biome requires LF, but git
normalises on compare, so the working tree looked clean and the same two files failed forever. Proved by
measurement: 91 of 236 lines CRLF → exit 1; normalised → exit 0. Fixed by normalising the blobs and
adding `.gitattributes` (`e8bdbb0`).

### 5.6 Analytics durability fix has a throughput cost

`ed2838f` correctly made ingest awaited-inside-the-job, but removed the batching that previously
existed: `analytics/worker.ts:26-37` now runs one job and one ClickHouse insert per event (`batch_size`
hardcoded to 1, concurrency 1). A 100-event browser batch becomes 100 jobs and 100 inserts. Correctness
improved; write amplification regressed. Worth a follow-up that keeps the durability win and restores
batching *inside* the job.

### 5.7 Shutdown does not drain in-process workers

`index.ts` calls `closeAllBullmqQueues()` on `SIGTERM`, but with `RUN_WORKERS=true` (the default) the API
process also hosts seven in-process BullMQ `Worker` instances. Their in-flight jobs are not awaited, so
they are killed mid-execution on every deploy. The worker entrypoint has the same gap. This is adjacent
to S6 and was not counted there — S6 was about the HTTP server, which is genuinely fixed.

---

## 6. Immediate actions, in priority order

1. **Rotate `WORKER_SERVER_SECRET`** and purge it from `.dev.vars`, `AUTH.md:72,81`. Owner-deferred
   (Phase 0 item 0.1). Everything in §2's S2 row — both defensive layers — assumes this value is private.
   Deleting it from HEAD is **not** sufficient: it is in history and already public.
2. **Delete `.kilo/worktrees/*`** or at minimum the `.env`/`.dev.vars` copies inside them (§5.3). This is
   minutes of work and closes a live secret-revival path.
3. **Add CI** with the two convention tests report 03/04 specified. Without it, §3 is guaranteed to grow —
   it already did, twice, while nobody was looking.
4. **Add a stored-vs-code machine-definition assertion** (§5.2). This is the highest-severity *new*
   finding: it silently disables an entire capability class, and it defeats testing done at the wrong layer.
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
- The verification was performed at `3625bb9`. A separate writer session has been active in this repo;
  line numbers cited here will drift as it commits, which is itself an argument for the CI in item 3.
