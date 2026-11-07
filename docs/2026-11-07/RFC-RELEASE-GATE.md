# RFC — Release gate: verification and progressive promotion for platform releases

> **Status:** **Proposed** — awaiting review. **Normative for release gating** where it conflicts with the eval or progressive-delivery RFC; those documents remain for rationale (see §12).
> **Date:** 2026-11-07 (America/Toronto)
> **Owns:** *when* a release may move, and *what evidence* allows the move. This is the **policy** layer.
> **Does not own:** what a check is ([`RFC-EVAL-SERVICE.md`](../2026-10-24/RFC-EVAL-SERVICE.md)) or how a release is stored and switched ([`RFC-PROGRESSIVE-DELIVERY.md`](../2026-10-24/RFC-PROGRESSIVE-DELIVERY.md)).
> **Related:** [`RELEASE-VERIFICATION-GAPS.md`](./RELEASE-VERIFICATION-GAPS.md) (the backlog this closes) · [`RFC-CRITICAL-REVIEW.md`](../2026-10-31/RFC-CRITICAL-REVIEW.md) · [`PUBLISH-VERIFICATION-SCALES.md`](../2026-10-31/PUBLISH-VERIFICATION-SCALES.md) · [`ENVIRONMENTS-AND-PROMOTION.md`](../2026-10-31/ENVIRONMENTS-AND-PROMOTION.md) · [`DATABASE-MIGRATIONS.md`](../2026-10-24/DATABASE-MIGRATIONS.md) · [`K8S-RUNBOOK.md`](../2026-10-31/K8S-RUNBOOK.md)

---

## 1. Problem

A platform change is deployed to **every tenant at once**, and none of it is reversible in the way that matters. The existing RFCs specify a rich check catalogue and a rollout vocabulary, but they never answer the question the gate depends on:

> **Which release is this tenant running, and what makes us believe the next one is no worse?**

Without an answer, “canary” means *deploy everywhere, then look* — detection after exposure, with no control group to attribute a failure to the change.

Three questions decide a release, and they need three different instruments:

| Question | Instrument | Owner |
|---|---|---|
| Did the change do what it claims? | tests, contract checks, migration rehearsal | this RFC (§3, §9) |
| Did it break anything we can observe? | candidate-vs-control diff, checks, metrics | this RFC (§4, §8) with [`RFC-EVAL-SERVICE`](../2026-10-24/RFC-EVAL-SERVICE.md) |
| Can we undo it? | pointer flip, definition activation, forward-fix | [`RFC-PROGRESSIVE-DELIVERY`](../2026-10-24/RFC-PROGRESSIVE-DELIVERY.md) §4–§7, policy here (§7) |

### Two scales, one gate

| | **Tenant publish** | **Platform release** |
|---|---|---|
| Someone edits | a page, layout or content entry | a block, machine, renderer, API, schema or config |
| Blast radius | one tenant, a handful of routes | every tenant, every route, several widths |
| Cost | ~25 ms of checks | minutes to hours |
| Frequency | constantly, by non-merchants | occasionally, by us |
| Mechanism | synchronous inline gate | **this RFC**: preview, cohorts, waves |
| Evidence | one record per publish | one record per gate decision |

The split is load-bearing: a tenant publish must never inherit a browser pool, a queue or cohort logic. A platform release must never be treated as a big tenant publish.

### Vocabulary

**Release** — an immutable build artifact plus its checks version. **Control** — the release tenants are on. **Candidate** — the release being verified. **Preview** — candidate and control run against the same data snapshot, with no tenant traffic. **Cohort** — the set of tenants moved at one stage. **Wave** — a later, larger cohort.

### What this RFC does not cover

- Check implementation, ids, levels, observation shape — eval RFC.
- Storage layout, pointer mechanics, channel configuration — progressive-delivery RFC.
- The operational checklist for release day — a separate **release workbook** (see gaps doc §10).

## 2. Release unit

The unit of progressive delivery is the **tenant**, not the request. A tenant is wholly on one release at a time, so no shopper sees a half-changed cart or a mixed-version checkout.

| Concept | Definition | Where implemented |
|---|---|---|
| **Release id** | Immutable identifier for one build (artifact hashes + checks version) | PD RFC §7 (V4) |
| **Release artifact set** | Client bundle **and** server image, worker image, migration set, config — immutable, retained | PD RFC §7 + deployment topology |
| **Client pointer** | `release_id` per tenant, read at request/edge time; selects the **client bundle** only | PD RFC §7 — **precondition** for this RFC |
| **Server selector** | Which server stack serves the environment (blue/green); selects the **server image** for everyone | D15 (pending) |
| **Release record** | `{ id, platformVersion, artifactHashes, checksVersion, createdAt, state }` | PD RFC §8 |

The three switches, and how they actually differ:

| Switch | Controls | Can undo | Owner |
|---|---|---|---|
| Feature flag | behaviour inside one build | a feature | existing flags |
| **Tenant → release pointer** | which **client bundle** a tenant loads | a bad UI build | PD RFC §7 |
| **Environment selector** | which **server stack** serves everyone | a bad server release | deployment topology / D15 |
| Deployment | rolling out a stack | — | deployment topology |

A flag cannot rescue code that fails before the flag is read (bad import, broken CSS, crashing renderer). That is why the pointer is a gate precondition, not a nice-to-have.

**A tenant pointer does not move the server.** Tenants share one API database; per-tenant server versions are a
different architecture (D15 option C) and are out of scope unless a hard requirement appears. A release that
changes the server is promoted by the **selector**; a release that changes the UI is promoted by the **pointer**.
The release id binds both artifacts, so a verdict always names the whole release even when only one switch moves.

**Pointer requirements** (owned by PD, relied on here): atomic move; audited (who moved which tenant, when, why); reversible in one operation; readable by the edge per tenant; no rebuild required to move.

**Build order is not reading order.** The pointer (§2) must exist before cohorts (§6); preview (§4) does not need it. This RFC is read top-down but built in the order of §11.

## 3. Verification plan — what must run for a given change

A release is not “run every check”. It is “run the checks the change can plausibly break, plus the invariants that must always hold.”

| Change class | Detection | Required checks | Minimum sample | Blocking |
|---|---|---|---|---|
| Renderer / client bundle | `packages/client` | render (`B1`), overflow (`B2`), a11y (`B3`) + **diff** | 3 tenants × top 4 routes × 2 widths | yes |
| Block / catalog | `packages/extensions`, catalog | `M5` + render diff on routes using the block | routes using the block | yes |
| Machine definition | `**/machines/*.json`, definitions API | `M4` + behaviour (`B5`) | checkout tenant | yes |
| Server domain / API | `packages/server/src/domains` | integration tests + contracts + `R1` | affected routes | yes |
| Event / API rename | event constants, route contracts | **contract checks** + dual-emit window (§9) | all consumers | yes |
| Schema / migration | `drizzle/` | dry run + before/after counts + invariants | full snapshot | yes |
| Config / infra | `deploy/`, env contract | environment conformance (§10) | environment | yes |
| Docs only | `docs/` | none — recorded as **not required** | — | no |

**Rule:** an ambiguous change takes the **highest** row it could belong to. Guessing low is how a renderer change ships with route checks only.

### Change detection and skip keys

A result may be reused only when **all three** match:

```
specHash @ releaseId @ checksVersion
```

- `specHash` alone is insufficient: a code release does not change tenant content, so a content-only key skips everything and reports “passed”.
- A new `releaseId` **never** inherits a previous pass.
- `checksVersion` changes whenever a check’s expectations change; that invalidates old passes by design.
- A skipped check is **`unverified`**, never `pass`. The report must show `verified` and `unverified` counts side by side.

Weekly full sweep, independent of change detection, to catch drift the incremental key cannot see.

## 4. Differential protocol — control vs candidate

Threshold assertions (“text length > 80”) catch a blank page and miss a dropped price. The primary signal for a platform release is **comparison against the previous release on the same data**.

```
start control release and candidate release against the same read-only snapshot
for each sampled tenant × route × width:
    render with control  → Observation A
    render with candidate → Observation B
    compare(A, B) → identical | expected | regression
```

Compared fields: HTTP status, title, normalised body text, node counts per block type (once block markers exist), horizontal overflow, console errors, a11y subset.

**Classification**

| Class | Meaning | Gate effect |
|---|---|---|
| `identical` | no difference beyond allowed noise | pass |
| `expected` | a reviewed, allowlisted difference | pass, recorded |
| `regression` | an unexplained difference | **block** |
| `unverifiable` | candidate or control could not be rendered | `unverified` |

**Allowlists** are reviewed artifacts, versioned with the release, with an expiry. An intentional change (new price format) is approved once and becomes the next control. An allowlist entry that never expires is a silent regression.

This borrows Scientist’s model directly: compare, clean, ignore known cases explicitly, publish mismatches — a mismatch is **data**, not an exception. Unlike Scientist, the candidate here is a whole release, and writes are never exercised in preview.

**Determinism:** explicit readiness marker, fixed fonts, animations disabled, network idle awaited, retries recorded. A flaky comparison is reported as such, never silently averaged.

**Safety:** preview uses a read-only snapshot, no platform credentials, and the same egress rules as the eval browser. A preview run must not be able to charge a card or send an email.

## 5. Gate contract

The gate emits exactly one of three verdicts. There is no boolean.

```ts
type ReleaseVerdict = {
  releaseId: string;
  decision: "pass" | "block" | "unverified";
  checks: CheckResult[];        // from @noname/eval — this RFC does not define them
  diff?: DiffSummary;           // candidate vs control (§4)
  contracts?: ContractResult[]; // §9
  data?: DataCheckResult[];     // §9
  environment?: ConformanceResult[]; // §10
  evidenceId: string;           // one per decision (§8)
  decidedBy: string;            // actor, or "auto"
  decidedAt: string;
};
```

| Verdict | Meaning | Effect |
|---|---|---|
| `pass` | every required check ran and passed; no unexplained diff | promotion may proceed |
| `block` | a required check failed, a regression was found, or a contract/data/conformance check failed | promotion stops |
| `unverified` | a required check **could not run** (no browser, timeout, infra) | promotion may proceed only with an explicit human acknowledgement, recorded |

Rules:

1. **A real failure blocks.** `warn` is reported and does not block.
2. **Only inability to check permits `unverified`** — and it is surfaced, counted, and never rendered as green.
3. **`unverified` is not allowed for destructive migrations** or for a release that changes contract boundaries. Those must be verified.
4. **`pass` is derived, never passed in.** No caller may supply a verdict.
5. **The gate is not the checks.** It composes their results with diff, contracts, data and conformance; each of those has one owner.

## 6. Promotion ladder

Two ladders, because there are two switches. A release needs the server ladder if its artifact set contains a
server change; it needs the client ladder if it contains a bundle change. Both may be needed.

### 6.1 Server ladder — the environment selector

| Stage | What moves | Dwell | Gate input | Rollback |
|---|---|---|---|---|
| **Preview** | candidate stack, no tenants | one run | checks + diff + data/env checks | discard |
| **Switch** | selector → candidate stack | observe 1–24 h | checks + metrics | selector back |
| **Stabilise** | — | 24 h | metrics | selector back |

The server is **not** canaried per tenant: one database, one selector. Behaviour changes inside the new server are
rolled out with flags, one tenant at a time.

### 6.2 Client ladder — the tenant pointer

| Stage | Tenants | Dwell | Gate input | Rollback |
|---|---|---|---|---|
| **Internal** | 1 (ours) | 24 h | checks + diff + metrics | pointer |
| **Canary** | 5 | 24 h | checks + sampled diff + metrics | pointer |
| **Wave 1** | 25% | 24 h | metrics + sampled checks | pointer |
| **Wave 2** | 50% | 24 h | metrics | pointer |
| **Global** | remainder | — | metrics | pointer |
| **Preview** | 0 (snapshot) | one run | checks + diff | discard candidate |

### Ordering rules

1. **Server before client** when the bundle depends on a new endpoint or response shape. Otherwise a tenant can
   load a bundle that calls something not yet live.
2. **Overlap is allowed only for additive, backward-compatible server changes** (expand/contract, §9/D16).
3. **A pointer rollback never rolls back the server;** a server rollback does not have to move the pointer if the
   old bundle is compatible.
4. Promotion is an **audited action** by a named role, recorded as Evidence. An agent may propose; it may not
   promote (same boundary as definition migration).
5. **Auto-halt** on `block`; auto-rollback is off by default in phase 1 — a human decides, and the decision is recorded.
6. Dwell times are policy constants; shortening them requires an explicit decision, not a per-release judgement.
7. A stage may be skipped only for a release that the change-impact map classifies as **docs only**.
8. Preconditions: pointer and selector exist (§2), rollback drill completed (§7), environment conformance green (§10).

## 7. Rollback and recovery

Three kinds of rollback, and “redeploy the previous image” is only the first:

| Rollback | Mechanism | Time | Owner |
|---|---|---|---|
| **Client artifact** | move tenant pointers back to the previous bundle | seconds | PD RFC §7 |
| **Server artifact** | switch the environment selector back to the previous stack (blue/green) | seconds | deployment topology / D15 |
| **Definition** | reactivate the previous `machine_definition` version; in-flight instances keep their pin | seconds | PD RFC §4 |
| **Data** | forward-fix by default; destructive migrations require expand/contract and a backup | minutes–hours | [`DATABASE-MIGRATIONS.md`](../2026-10-24/DATABASE-MIGRATIONS.md) + this RFC |

Rules:

1. **Never “roll back” a destructive migration by reverting it.** Restore or forward-fix.
2. Destructive migrations run **expand → migrate → contract**, so no release boundary is incompatible with the data.
3. **Two switches, two failures.** A client pointer rollback fixes a bad bundle; it does not fix a bad server. A
   selector rollback fixes the server; it does not re-point tenants unless their bundle is incompatible.
4. A rollback drill is a gate precondition for the first release of a new artifact class, and after any migration change.
5. Every rollback produces an incident record and a gate review: what was missed, and which layer (check, contract, data, environment, metric) should have caught it.

## 8. Evidence and metrics

**One Evidence record per gate decision**, not per check. This is the correction the critical review asked for.

```
type: "platform.release.gate"
subjectType: "platform.release"
subjectId: releaseId
correlationId: verdictId
data: { decision, sample, failingCheckIds, diffSummary, actor, releaseId, checksVersion }
```

- Per-check detail goes to **metrics**, and only **failures** produce bounded evidence rows (capped, sampled).
- Metrics: gate verdict counts, `unverified` count, failures by check id, regressions by route, flake/skip rate, time-to-global, rollbacks.
- **Outcome metrics** (the review’s biggest gap): incidents the gate missed, false-block rate, top-route coverage per tenant, and the share of releases that completed without a rollback.
- Retention: Evidence is append-only; operational metrics use the existing registry. No per-check flood into the audit kernel.

## 9. Contract and data checks

Pages can be green while the platform is broken. Two classes are mandatory for the change types that cross a boundary:

**Event / API contracts**

- Every emitted event has at least one live subscriber; every subscriber’s event still exists.
- A rename ships as **dual-emit for one release**: emit old and new, migrate consumers, then contract. The window is a release, not a compatibility layer.
- The contract step fails if the old event is still emitted after the window closes.

**Migrations**

- Rehearse on a clone: run the migration, compare row counts and constraints before/after, time it.
- Invariants are explicit (orders per state, active definition versions, cart totals).
- Destructive steps require a backup and an explicit approval; `unverified` is not available.

Mechanics live in the migration doc; the **policy** (when a contract or data check is required, and that it blocks) lives here.

## 10. Environment conformance

A deployment can be complete and still unable to work: the Secret-pruning incident produced a pod that was `Running` and could reach nothing.

Conformance inputs, consumed as a gate input:

- readiness (`/ready`) for every service;
- every required env/secret key present (contract from `.env.example` and the cluster Secret);
- migration state matches the release;
- image digest matches the release record;
- browser endpoint reachable when the plan includes tier 2.

A conformance failure is a **`block`**, not `unverified`, when it is a configuration error we control. Implementation is the existing `k8s.mjs status`; this RFC makes its output a gate input rather than a manual check.

## 11. Phasing and falsification

Each phase ships only with a demonstrated failure. A gate that has never been seen to fail is decoration.

| Phase | Ships | Acceptance (observed) |
|---|---|---|
| **P1** | Gate contract (`pass/block/unverified`), platform-version skip key | A release with unchanged specs reports `unverified`, not `passed`; a forced overflow blocks |
| **P2** | Preview environment + differential protocol | A dropped price appears as a regression and blocks; an approved change becomes the new baseline |
| **P3** | Pointer + selector promotion (client waves; blue/green server switch) | Move one tenant to the candidate and back; switch the server selector and roll it back; a failing canary halts before wave 1 |
| **P4** | Contracts, migration rehearsal, env conformance | A renamed event without dual-emit fails; a row-dropping migration fails rehearsal; a missing secret key blocks |
| **P5** | Metrics, cross-testing, outcome reporting | A loosened check fails cross-testing; missed-incident and coverage numbers are published |

P1/P2 do not need the pointer; P3 does. This ordering is deliberate: verification earns trust before it is allowed to gate anything.

## 12. Relations and supersession

This RFC is **normative for release gating**; the older documents remain for rationale and for the parts they still own.

### Eval RFC

| Section | Status |
|---|---|
| §1 consumers | release consumers now here (§6); check consumers stay |
| §5.3 `gate` mode | execution context stays; blocking/telemetry policy here (§5) |
| §6 change detection / skip | **superseded** — here (§3) |
| §7 `passed` / `evidenceId` | **split** — `CheckResult` stays; verdict here (§5) |
| §8 Evidence policy | **superseded** — here (§8) |
| §11 consumers table | **superseded** — here (§6) |
| §13 release phasing | **superseded** — here (§11) |
| §14 Q1, Q2, Q4 | **moved** — here (§13) |
| Check ids, tiers, `Observation`, determinism, browser runtime | **stay** |

### Progressive-delivery RFC

| Section | Status |
|---|---|
| §2 “safety net is the gate + rollback” | reworded to reference here (§7) |
| §3 “deterministic where Argo is statistical” | qualified — true for output assertions only (§4) |
| §6 V3 eval gate | **superseded** — here (§5) |
| §8 promotion state machine | **superseded** — here (§6) |
| §9 Q3, Q6 | **moved** — here (§13) |
| §11 P1 “gate available” | **superseded** — here (§11) |
| §12 flakiness / cost / rubber-stamp risks | **moved** — here (§8, §13) |
| V1 pinning, V2 channels, V4 pointer/keys, definition rollback | **stay** |

### Other documents

- [`PUBLISH-VERIFICATION-SCALES.md`](../2026-10-31/PUBLISH-VERIFICATION-SCALES.md) — the tenant/platform split and the fail-open rule are canonical here (§1, §5); the note is retained as rationale.
- [`RFC-CRITICAL-REVIEW.md`](../2026-10-31/RFC-CRITICAL-REVIEW.md) — historical falsification record. Resolved items (Evidence inversion, `B1` dropped, MVP cut) are reflected above; open items (retention, outcome metrics, domain-port boundary) are owned by §8 and the eval RFC.
- [`RELEASE-VERIFICATION-GAPS.md`](./RELEASE-VERIFICATION-GAPS.md) — maps each gap G1–G12 to a section of this RFC.

## 13. Open questions

| # | Question | Recommendation |
|---|---|---|
| Q1 | Sample size and dwell times | 3 tenants × top 4 routes × 2 widths; 24 h per stage; widen only after two clean releases |
| Q2 | Who may acknowledge `unverified`? | A named release role; destructive migrations and contract changes never eligible |
| Q3 | Who may promote a cohort? | The release role; audited as Evidence; agents may propose only |
| Q4 | Are approved diffs stored or recomputed? | Stored — an approved baseline is a review artifact with an expiry |
| Q5 | How many releases retained per tenant? | 3; the rollback window is the retention window |
| Q6 | When may a breaking change ship without a window? | Only when no consumer crosses the release boundary; events and APIs always get expand/contract |
