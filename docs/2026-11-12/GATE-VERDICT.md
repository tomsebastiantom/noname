# Gate verdict lookup — a wave may not move a tenant that failed (step 5)

> **Status:** **implemented and verified 2026-11-12** · **Scope:** roadmap step 5. Adds per-tenant gate verdicts
> derived from the eval decision records and makes rollout eligibility refuse `block`, `unverified` and `missing`.
> **Related:** [`TENANT-DIRECTORY.md`](./TENANT-DIRECTORY.md) ·
> [`../2026-11-07/IMPLEMENTATION-ROADMAP.md`](../2026-11-07/IMPLEMENTATION-ROADMAP.md)

---

## 1. The gap

After step 4, eligibility knew the tenant existed and was not suspended. It still did **not** know whether that
tenant's own verification passed. A tenant whose gate returned `blocked` was reported `eligible` and would have
been promoted.

## 2. Where the verdict comes from

Not recomputed — read from the eval gate sink. Each decision is one `evidence_records` row:

```
type      platform.eval.run
org_id    <tenant>
data      { decision: "pass" | "blocked", checksVersion, counts: { fail, unverified, … } }
correlation_id = runId
```

`createGateVerdictService` reads the **latest** such row for the tenant and maps it:

| Condition | Verdict | Reason |
|---|---|---|
| no row | `missing` | `no_decision` |
| `decision = blocked` | `block` | `blocked` |
| pass, but `checksVersion` ≠ the release's catalogue | `unverified` | `checks_version_mismatch` |
| pass, but `counts.unverified > 0` | `unverified` | `unverified_checks` |
| pass on the same catalogue, nothing unverified | `pass` | — |

The `checksVersion` rule is the important one: a pass against a **different** checks catalogue is not a pass for
this release, so it degrades to `unverified` rather than being trusted.

## 3. Where it is enforced

| Surface | Behaviour |
|---|---|
| `GET /api/platform/tenants/:orgId/verdict?checksVersion=` | platform-only read of the current verdict |
| `POST /api/releases/:id/rollout` | each org is gated: `pass` → eligible; otherwise skipped with a reason |

Skip reasons are distinct so an operator can tell “failed” from “not verified yet”:

```
verdict_blocked      the tenant's gate returned blocked
verdict_unverified   pass against another catalogue, or required checks were skipped
no_verdict           no decision recorded at all
```

`missing` is **skipped**, not allowed. “We have no decision” is not evidence that a tenant is safe to move.

## 4. Verification

Unit — `release/verdict.test.ts` (6 tests): missing, clean pass, blocked, catalogue mismatch, unverified counts,
and the no-evidence case.

Live — one release (`checksVersion=c`) against five orgs:

```
398655937176469540 → eligible              (pass recorded, same catalogue)
111000222          → skipped verdict_blocked
222000333          → skipped no_verdict
999000111          → skipped tenant_suspended
typo-org           → skipped unknown_tenant
```

Direct reads:

```
GET /verdict?checksVersion=c  → {"status":"pass","runId":"run-pass-1"}
111000222                     → {"status":"block","reason":"blocked"}
222000333                     → {"status":"missing","reason":"no_decision"}
```

Suites: `release` + `tenant-directory` → **67/67**; typecheck clean.

## 5. Limits

- **No acknowledgement path yet.** `unverified` is skipped, which is the conservative reading of D9; an operator
  ack that allows `unverified` tenants to proceed is a decision not yet recorded, let alone implemented.
- Verdict is per **tenant**, not per release. A release-specific verdict needs `releaseId` stored on the eval
  record; today the link is the checks catalogue.
- The eval record does not carry `platformVersion`, so “verified on this exact build” is not expressible yet.
- Reading the latest row means a later blocked run overrides an earlier pass — intended — but there is no history
  view in the API beyond the raw evidence records.

## 6. Next

Step 6 — enable the write path: honour `dryRun: false` for **one explicitly named org**, write the pointer + one
audit row per org, then batch with partial-failure reporting.
