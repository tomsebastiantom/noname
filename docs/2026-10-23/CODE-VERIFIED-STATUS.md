# Code-Verified Status — 2026-10-23

**Date:** 2026-10-23 (America/New_York)
**Purpose:** a dated snapshot of what is *actually* true in the tree right now, so the next session does not
have to re-derive it from docs that may have drifted.
**Method:** **docs are claims, code is truth.** Every status below was produced by a command or a
`file:line` read during this session, and the command is given so it can be re-run. Where an older document
disagrees with the code, the disagreement is recorded in §7 rather than silently resolved.

---

## 1. Ground truth

| Fact | Value | How to check |
|---|---|---|
| Commit | `f580da5`, in sync with `origin/main`, tree clean | `git rev-parse --short HEAD; git status --short` |
| Test suite | **849 tests, all passing** | `pnpm exec vitest run` |
| Lint/format gate | `pnpm check` exits **0** | `pnpm check` |
| Typecheck | `pnpm --filter @noname/server typecheck` exits **0** | same |
| Live stack | API `:3000` (`/health`, `/ready`, `/metrics` 200), edge `:8787`, client `:5173` | curl each |

**Known flake, recorded honestly.** One run out of four reported `2 failed | 839 passed` and the failing
tests were not captured before the run ended; the next three runs were fully green. The likely candidates
are the timing-based tests added in this workstream (`transition-relay`, `lifecycle`, `metrics` use real
timers at 10–30 ms) or suites that open a real pool with a 5 s timeout. **Not identified.** This is one
concrete reason to wire CI (§8): a flake seen 1-in-4 by hand is seen immediately when it runs per push.

---

## 2. Audit remediation — Phase 0 and Phase 1

Source plan: `docs/2026-10-10/architecture-audit/07-REMEDIATION-ROADMAP.md`.

### Phase 0 — 10 of 11 done

Only **0.1 rotate `WORKER_SERVER_SECRET`** remains (owner-deferred). Evidence that it is still live: the
value is tracked in `packages/workers/.dev.vars`, quoted in `docs/2026-07-13/AUTH.md`, and present in HEAD.
Both defensive auth layers assume it is private.

### Phase 1 — 4 of 10 done, 6 open

| # | Item | Status today | Evidence |
|---|---|---|---|
| 1.0 | Fix pre-existing Biome errors | **DONE** | `pnpm check` → 0 |
| 1.1 | Add CI | **OPEN** | no workflow runs these gates |
| 1.2 | `architecture.test.ts` | **OPEN** | `packages/server/src/architecture.test.ts` does not exist |
| 1.3 | `catalog-conventions.test.ts` | **OPEN** | `packages/client/src/catalog-conventions.test.ts` does not exist |
| 1.4 | Biome `noRestrictedImports` / `noRestrictedSyntax` | **OPEN** | neither key appears in `biome.json` |
| 1.5 | Widen vitest coverage | **OPEN** | `vitest.config.ts` → `coverage.include: ["./packages/server/src/**/*.ts"]` |
| 1.6 | Boot-time env validation (= risk S17) | **OPEN** | no schema; only `DATABASE_URL` is checked inline |
| 1.7 | Readiness + metrics (= risk S16) | **DONE** | `/ready`, `/metrics` (prom-client, 43 families) |
| 1.8 | Retention jobs (= risk S15) | **DONE** | `shared/retention.ts` + three reapers |
| 1.9 | `document_ops` server-version uniqueness | **DONE** | unique index live + `retryOnUniqueViolation`; see §5 |

---

## 3. Report-05 risks — 12 fixed / 3 partial / 2 still present

Detail and per-item evidence live in `docs/2026-10-15/ARCHITECTURE-AUDIT-RECONCILIATION.md` §2 and §5.
This session's commits:

| Commit | What it fixed |
|---|---|
| `77def4e` | S8/S7 — Redis fan-out failures visible, non-fatal, hang-proof |
| `939753e` | S10 — tenant-settings cache + storefront slug index |
| `d4728de` | S9 — honour the whole `REDIS_URL`; §5.7 worker drain on shutdown |
| `00efa8e` | S11 — committed transitions no longer reported as failures; S12 retention |
| `2c80167` | S16 `/ready` + `/metrics`; S12 batched `flag.evaluated` |
| `1128929` | S15 — reapers for idempotency rows and provider receipts |
| `8ceef6d` | S14 — one webhook per transition across replicas |
| `9e0e7ec` | S14 — SSE addressed by topic, not a payload `userId` |
| `d46c277` | S14 — tenant-settings cache fill fenced against invalidation |
| `3f13a64` | S7 — re-publish undelivered transitions from the log |
| `b3057d5` | backlog index predicate aligned with the relay query |
| `4d63482` | S16 prom-client instrumentation; §5.19 collab flush on shutdown |
| `f580da5` | §5.20 browser regression pass |

Remaining: **S17** (env validation), **S11** (needs a read-after-write decision), **S12** (measured, no sink
unless a trigger fires), **S7** (~30 notification publishers best-effort by design).

---

## 4. What is verified live vs not

Verified at runtime in this session:

- 9/9 browser checks against client → edge → API: storefront, login, sign-in, admin dashboard, visual
  editor, `GET /api/tenants/resolve/yogastore` 200, `GET /api/flags/stream` 200, 0 console errors, 0 failing
  `/api` responses.
- Metrics move with traffic (5 requests → counter +5); `/ready` reflects a real database probe.
- Webhook dedupe with two replicas: 1 delivery row / 1 job, versus 2 / 2 with the fix reverted.
- Transition relay: clearing a marker re-published the transition and produced a delivery with
  `{org}:{instance}:{revision}`.
- Cross-replica cache invalidation: replica B saw a write made on replica A, and followed the restore.
- Order capabilities (§6): cancel and fulfill through the real API, idempotent replay, and a 409 CAS conflict.
- **The retention reapers fired for real.** `/metrics` shows
  `noname_retention_rows_deleted_total{table="capability_idempotency"} 14` and `{table="flag_evaluations"} 93`
  — the S15 and S12 sweeps deleted rows older than their default windows without anyone asking. The windows
  are therefore **live, not theoretical**: any environment upgrading into this code will lose history beyond
  30 days / 7-days-past-expiry unless the thresholds are raised first. That is what retention means, but it
  belongs in an upgrade note, and the metric is how it was detected.

Deliberately **not** claimed: the collab shutdown flush (needs a live WS client and a graceful exit, which
cannot be signalled on Windows), and any browser flow beyond the nine checks above.

---

## 5. `document_ops` server versions — fixed

Measured on the live database before the fix:

```text
columns:  org_id, document_id, server_version bigint, ...
indexes:  document_ops_pkey (id)
          document_ops_document (org_id, document_id)
          document_ops_client_dedup (client_id, client_seq)   UNIQUE
```

The insert path computes the next version as `SELECT coalesce(max(server_version), 0::bigint) + 1` with **no
unique index on `(org_id, document_id, server_version)`**, so two concurrent writers could read the same
`max(...)` and both insert the same version number — ambiguous history with nothing to detect it. The client
dedupe index did not cover it: it keys on `(client_id, client_seq)`, which only exists for client-originated
ops.

Fixed with both halves:

- **`document_ops_server_version_unique`** on `(org_id, document_id, server_version)`, added to the drizzle
  schema and applied to the live database. Verified: a duplicate version is rejected with 23505, a different
  version is still accepted, and the existing rows were clean (nothing to reconcile).
- **`retryOnUniqueViolation`** in `shared/postgres-errors.ts`, wrapping the *whole* `recordDocumentOp` body.
  That matters: a conflict can come from either index, and on a client-dedupe conflict the retry's
  pre-check finds the winner and returns its version instead of inserting a second op. After the configured
  attempts the original error is rethrown, so a genuine duplicate still surfaces.

7 unit tests; falsified by removing the retry (2 fail).

---

## 6. Commerce release gate — cancel and fulfill now proven, refund still not

`docs/2026-10-10/RELEASE-VERIFICATION-STATUS.md` §4 listed these as **NOT verified**. Two of them are now
proven end-to-end, by creating throwaway paid fixtures and driving the **real capability API through the
edge** with only a session JWT (no hand-made HMAC), then asserting database state:

| Check | Result |
|---|---|
| `commerce.orders.cancel` | **200**, exactly one `CANCEL_ORDER` transition, machine at `cancelled` |
| cancel writes Evidence | 1 `commerce.order.cancelled` record (keyed by `correlationId`) |
| same `Idempotency-Key` replay | **200**, still exactly one transition, content-identical result |
| stale `expectedRevision` | **409 CONFLICT**, order stays `paid` — CAS is real |
| `commerce.orders.fulfill` | **200**, one `MARK_FULFILLED` transition, machine at `fulfilled` |
| `commerce.orders.refund` | **fails closed**: 500, no transition, order stays `paid` |

The refund is **not proven**, and the reason is environmental rather than a code fault — the handler calls
the provider through Nango (`POST http://localhost:3003/proxy/v1/refunds`, connection
`yogastore-stripe-test`), which returns **404** here because that Stripe connection is not provisioned.
Failing closed is the correct behaviour (it must never enter `refund_pending` without a provider refund) and
is what the probe asserts.

Two notes from the run itself — **both now fixed** rather than worked around:

- An idempotent replay returned the result from `capability_idempotency.result`, which was **`jsonb`**, so
  Postgres canonicalised key order and the replay body's keys came back in a different order than the live
  response. Now `json`: the replay is **byte-identical** (424 bytes, verified). The IETF Idempotency-Key
  draft says a duplicate SHOULD be answered with "the result of the previously completed operation", and
  nothing queries inside that column, so `jsonb`'s indexing advantages bought nothing.
- Evidence was only reachable by `subject_id` (the order ref), so "everything in this workflow" had **no
  query filter and no index**. Added `EvidenceListQuery.correlationId` + the partial index
  `evidence_records_org_correlation_idx`. Verified with the planner forced: `Index Scan using
  evidence_records_org_correlation_idx`.

The third finding was a semantics bug: `correlationId` and `causationId` were **both the instance id**, which
made "which transition produced this record?" unanswerable and read as though the record caused itself.
`causationId` is now the transition's own identity (`{instanceId}:{revision}`, the same value the Evidence
idempotency key uses), while `correlationId` stays the workflow. Verified live:
`correlation=…e89, causation=…e89:3`. A unit test pins the distinction and fails if the two are made equal
again.

On cleanup: the probe above deleted evidence by the wrong column and left 6 rows behind. The fix is not an
ad-hoc `DELETE` helper — evidence is append-only by design, and a public delete would undermine that — but
**querying by the right key**. "All evidence for this aggregate" is `subject_type`+`subject_id`; "all
evidence for this process" is now `correlation_id`; both are indexed, so cleanup and audit ask the right
question instead of guessing a column. Erasure, when it is needed, should be redaction/tombstoning rather
than deletion.

Still **NOT verified**:

- refund end-to-end (provider connection), refund from the browser, `commerce.inventory.release`,
  `REFUND_CONFIRMED → refunded` (not built).
- concurrent same-key race through the app; tenant isolation via a second org; cursor pagination boundary.
- **no real Stripe webhook has ever been captured** — the callback was a locally signed Nango-boundary
  simulation.
- the `inventory_reservation` machine exists only because it was inserted by hand; it is **not in the
  commerce seed**.

---

## 7. Corrections — claims that were stale or wrong

Recorded because the point of a dated doc is to find these.

| Claim | Where | Reality |
|---|---|---|
| "6 markdown files carry U+FFFD corruption" | stated in chat during this workstream | **0 files** contain U+FFFD across `docs/` (byte check). Corrected here. |
| Phase 0 header "9 of 11 complete; 0.4 remaining" | `PHASE-0-REMEDIATION-STATUS.md` header | already self-corrected in that doc: 0.4 completed `847fbf0`; header was stale |
| `README.md:186` "`pnpm lint` … (0 errors)" | `README.md` | **true today** — `pnpm check` exits 0 |
| "cancel/fulfill/refund are verified" | `MANUAL-VERIFICATION-CHECKLIST.md` (2026-10-08 entry) | contradicts `RELEASE-VERIFICATION-STATUS.md` §4; the checklist **overstates** what was proven |
| Podman VM down → edge `400 org id required` | observed 2026-10-23 16:2x | environmental: dependencies unreachable; after `podman machine start` the same request returned 200 with **no code change** |

---

## 8. Next, ranked by value

| Priority | Item | Effort | Why now |
|---|---|---|---|
| 1 | **Rotate `WORKER_SERVER_SECRET`** (Phase 0.1) | 15 min | Only active credential exposure; both auth layers depend on it being private |
| 2 | ~~1.9 `document_ops` unique index + retry~~ | — | **done** (§5) |
| 3 | **Prove `refund` end-to-end**, and seed the `inventory_reservation` machine | M | Cancel and fulfill are now proven (§6); refund needs a provisioned Nango→Stripe connection, otherwise it is only proven to fail closed |
| 4 | **Phase 1.1–1.5: CI + two convention tests + Biome restrictions + coverage scope** | ~1–2 weeks total | Converts this workstream's manual fixes into enforced rules; also surfaces the 1-in-4 flake |
| 5 | **1.6 / S17 boot-time env validation** | M | Last genuine report-05 bug |
| 6 | S11 decision, Stripe sandbox replay, Phases 2–4 | M–L | Product/architecture work |

Ordering rationale is the audit's own: **security → enforcement → boundaries → durability → docs.**

---

## 9. Search keywords

Terms that should find this document when grepping `docs/`:

- Risks: `S7` `S8` `S9` `S10` `S11` `S12` `S14` `S15` `S16` `S17` `§5.7` `§5.11` `§5.13` `§5.16` `§5.19` `§5.20`
- Phase items: `0.1` `1.1` `1.2` `1.3` `1.4` `1.5` `1.6` `1.9`
- Code anchors: `document_ops_pkey` `document_ops_client_dedup` `server_version` `flag_evals_evaluated_at`
  `webhook_outbound_subscription_event_idx` `provider_event_receipts_created_at_idx`
  `capability_idempotency_expires_at_idx` `documents_store_slug_unique` `machine_transitions_unpublished_idx`
- Middleware / entrypoints: `orgMiddleware` `runShutdownTasks` `createRetentionGate` `transition-relay`
  `sse-manager` `metrics.ts` `observability.ts`
- Config: `WORKER_SERVER_SECRET` `FLAG_EVALUATION_RETENTION_DAYS` `PROVIDER_EVENT_RECEIPT_RETENTION_DAYS`
  `CAPABILITY_IDEMPOTENCY_SWEEP_GRACE_DAYS` `MACHINE_TRANSITION_RELAY_INTERVAL_MS`
- Commits: `f580da5` `4d63482` `b3057d5` `3f13a64` `d46c277` `9e0e7ec` `8ceef6d` `1128929` `2c80167` `00efa8e` `d4728de` `939753e` `77def4e`
