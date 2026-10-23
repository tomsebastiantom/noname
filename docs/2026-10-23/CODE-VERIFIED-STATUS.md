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
| Test suite | **187 files / 841 tests, all passing** (3 consecutive runs) | `pnpm exec vitest run` |
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

### Phase 1 — 3 of 10 done, 7 open

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
| 1.9 | `document_ops` server-version uniqueness | **OPEN — real bug, see §5** | index missing |

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

Deliberately **not** claimed: the collab shutdown flush (needs a live WS client and a graceful exit, which
cannot be signalled on Windows), and any browser flow beyond the nine checks above.

---

## 5. New correctness finding — `document_ops` server versions can collide

Measured on the live database:

```text
columns:  org_id, document_id, server_version bigint, ...
indexes:  document_ops_pkey (id)
          document_ops_document (org_id, document_id)
          document_ops_client_dedup (client_id, client_seq)   UNIQUE
```

The insert path computes the next version as

```sql
SELECT coalesce(max(server_version), 0::bigint) + 1   -- adapters/postgres.ts:385
```

with **no unique index on `(org_id, document_id, server_version)`**. Two concurrent writers can read the
same `max(...)` and both insert the same version number, so the version history becomes ambiguous with
nothing to detect it. This is roadmap item **1.9**; the client-side dedupe index does not cover it.

---

## 6. Commerce release gate — still unproven through the app

`docs/2026-10-10/RELEASE-VERIFICATION-STATUS.md` §4 lists these as **NOT verified**, and nothing in this
session changed that:

- **cancel / fulfill / refund through the capability API** — the `cancelled`/`fulfilled` rows in the
  database were produced by direct SQL, so the capability handler, revision CAS and idempotency replay were
  never exercised end-to-end.
- refund from the browser; `commerce.inventory.release`; `REFUND_CONFIRMED → refunded` (not built).
- concurrent same-key race through the app; tenant isolation via a second org; cursor pagination boundary.
- **no real Stripe webhook has ever been captured** — the callback was a locally signed Nango-boundary
  simulation.
- the `inventory_reservation` machine exists only because it was inserted by hand; it is **not in the
  commerce seed**.

For a commerce product this is the largest single unknown in the repository.

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
| 2 | **1.9 `document_ops` unique index + retry** | S | Real correctness bug (§5) |
| 3 | **Prove cancel/fulfill/refund via the capability API** | M | Largest unknown (§6); also exercises CAS + idempotency replay |
| 4 | **Phase 1.1–1.5: CI + two convention tests + Biome restrictions + coverage scope** | ~1–2 weeks total | Converts this workstream's manual fixes into enforced rules; also surfaces the 1-in-4 flake |
| 5 | **1.6 / S17 boot-time env validation** | M | Last genuine report-05 bug |
| 6 | S11 decision, Stripe sandbox replay, seed the inventory machine, Phases 2–4 | M–L | Product/architecture work |

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
