# Release verification — gaps between the RFCs and the proposed method

> **Status:** findings (analysis only, no implementation) · **Date:** 2026-11-07 (America/Toronto)
> **Question:** what must we *build* so a platform change can be verified and released progressively, and what is missing between the two existing RFCs and the method we now believe is right?
> **Not this document:** the operational release checklist. That is a separate *release workbook* (scope boundary in §10). This document is a build backlog.
> **Method under test:** the tenant-level release ladder (pointer → preview → canary tenants → waves), described in §4.
> **Follow-up:** the RFC this document recommends is now written — [`RFC-RELEASE-GATE.md`](./RFC-RELEASE-GATE.md) (2026-11-07).
> **Related:** [`RFC-EVAL-SERVICE.md`](../2026-10-24/RFC-EVAL-SERVICE.md) · [`RFC-PROGRESSIVE-DELIVERY.md`](../2026-10-24/RFC-PROGRESSIVE-DELIVERY.md) · [`RFC-RELEASE-GATE.md`](./RFC-RELEASE-GATE.md) · [`RFC-CRITICAL-REVIEW.md`](../2026-10-31/RFC-CRITICAL-REVIEW.md) · [`PUBLISH-VERIFICATION-SCALES.md`](../2026-10-31/PUBLISH-VERIFICATION-SCALES.md) · [`ENVIRONMENTS-AND-PROMOTION.md`](../2026-10-31/ENVIRONMENTS-AND-PROMOTION.md) · [`K8S-RUNBOOK.md`](../2026-10-31/K8S-RUNBOOK.md)

---

## 1. Why this document exists

The two RFCs answer two questions well:

- **Eval RFC:** “does this tenant’s page still work?” — checks, tiers, result contract.
- **Progressive-delivery RFC:** “how do changes reach tenants, and how do we undo them?” — versions, channels, gate, rollback.

They do **not** answer the question that decides whether either one can work:

> **Which release is this tenant running, and how do we show that the next one is no worse?**

That is a build gap, not a documentation gap. It is recorded here as a backlog so the findings are not lost, and so a release workbook can later be written against mechanisms that actually exist.

**Evidence rule:** docs are claims; code is truth. Every gap below cites current code or a dated document. Snapshot: 2026-11-07.

## 2. What exists today (verified snapshot)

| Thing | State | Evidence |
|---|---|---|
| Eval library | 3 check functions, ids `M4.machines`, `M5.vocabulary`, `R1.resolve` (+ `R1.fallback`), `R2.blocks` — committed | [`packages/eval/src/checks/`](../../packages/eval/src/checks/) |
| Browser checks | `B1.render`, `B2.console` — **uncommitted**, do not typecheck (10 errors) | working tree; `pnpm --filter @noname/eval typecheck` |
| `noname eval` | Runs tier 0/1 over HTTP; no browser endpoint, no `siteBase` → browser checks report `skip` | [`packages/cli/src/commands/eval.ts`](../../packages/cli/src/commands/eval.ts) |
| Bundle storage key | `tenants/<orgId>/<filename>` — **every build overwrites the same key** | [`worker.ts:44`](../../packages/server/src/domains/tenant/worker.ts#L44) |
| Bundle version | `version: 1` hardcoded; old bundle is not retained | [`worker.ts:62`](../../packages/server/src/domains/tenant/worker.ts#L62) |
| Platform version in manifest | `platform: { version: "1", hash: "init" }` hardcoded in stores | [`manifest-store.ts:48`](../../packages/server/src/domains/tenant/adapters/manifest-store.ts#L48), [`redis-manifest-store.ts:26`](../../packages/server/src/domains/tenant/adapters/redis-manifest-store.ts#L26) |
| Tenant → release pointer | **does not exist** | no column, no route, no pointer in the tenant manifest |
| Preview environment | **does not exist**; environments are local / staging / prod | [`ENVIRONMENTS-AND-PROMOTION.md`](../2026-10-31/ENVIRONMENTS-AND-PROMOTION.md) |
| Browser fleet | deployed in k3s, **idle** — nothing calls it | [`K8S-MIGRATION-STATUS.md`](../2026-10-31/K8S-MIGRATION-STATUS.md) step 14 done, step 15 pending |
| Eval Evidence | `platform.eval.run` not registered in retention | [`RFC-CRITICAL-REVIEW.md`](../2026-10-31/RFC-CRITICAL-REVIEW.md) §2.2 |

Two documentation defects found while checking:

1. The eval RFC header still says “No code written yet”, but an MVP exists.
2. The tracker’s step 15 (“wire eval”) is still `pending`, and the untracked browser files are the beginning of that step.

## 3. The framing: three switches, not one

The confusion in earlier discussion came from treating “feature flag”, “release” and “deploy” as the same switch. They are three:

| Switch | Controls | Can undo | Exists today? |
|---|---|---|---|
| **Feature flag** | behaviour inside one build | a feature | **yes** — org-scoped flags |
| **Tenant → release pointer** | *which build* a tenant loads | a bad build | **no** |
| **Deployment** | API/worker code for everyone | server code | yes (images), but all tenants at once |

A flag cannot rescue code that fails before the flag is read (a bad import, broken CSS, a crashing renderer). That is why platform changes need the middle switch. **The release unit is the tenant, not the request** — a tenant is wholly on one release, so no shopper sees a half-changed cart.

## 4. The method this gap list is measured against

One page, so the backlog has a target:

```
build (immutable artifact + release id)
  → preview: run CURRENT and CANDIDATE against the same data snapshot,
             render sampled tenants × routes, diff the output
  → internal tenant    (pointer → candidate)
  → canary tenants     (5–10, one at a time)
  → waves              (25% → 50% → 100%)
  → global
rollback at any step = move the pointer back
```

Verification layers used by the gate:

| Layer | Question | Mechanism |
|---|---|---|
| Change-scoped | did the change do what it claims? | tests, migration dry run, contract checks |
| Differential | did output change in unintended ways? | control vs candidate diff (same data) |
| Contract | do events/APIs still match their consumers? | event/consumer checks, dual-emit window |
| Data | did the migration preserve rows and invariants? | before/after counts, constraints |
| Environment | is the deployment itself complete? | readiness, config/secret keys, migration state |
| Observational | is the running fleet healthy? | error rate, checks, outcome metrics |

Flags remain for behaviour. Migrations and cross-release event renames use expand/contract.

## 5. Gap catalogue

Sizes are relative (S < 1 day, M ≈ 2–5 days, L > 1 week). “Acceptance” must be *observed*, not asserted.

| # | Gap | Why it matters | Acceptance (observed) | Size |
|---|---|---|---|---|
| **G1** | **No tenant → release pointer; bundle key is overwritten** | Without it there is no control group and no rollback; “canary” can only be post-hoc detection | Two bundles coexist in storage; tenant A is moved to the new one and back; the old URL still serves | M |
| **G2** | **No preview/control arm** | A check with no comparison cannot attribute a failure to the change | Candidate and current run against the same DB snapshot; a report lists per-route differences; no tenant traffic involved | M |
| **G3** | **No differential comparison or baselines** | Thresholds (“text length > 80”) miss dropped prices/descriptions; `B1.structure` is unimplementable today | An intentional content drop shows as a diff; a deliberate regression blocks; an approved change becomes the new baseline | M |
| **G4** | **Skip key ignores platform version; `skip` is green** | A code release does not change `specHash`, so the sweep skips every route and reports “passed” | Release with unchanged specs reports `unverified`, not `passed`; a fixed sample is forced per release | S |
| **G5** | **No change-impact map** | Without it the choice is “run everything” or “run nothing” | Renderer change runs render checks on the sample; machine change runs `M4`; event change runs the contract check — automatically | S–M |
| **G6** | **No contract checks for events/APIs; no dual-emit window** | Renamed events break webhooks while every page check stays green | A rename without dual-emit fails before promotion; with dual-emit it passes, and the contract step fails after the window closes | M |
| **G7** | **No migration rehearsal or data checks; no rollback rule for data** | Immutable images roll back; migrations may not | A migration that drops rows fails rehearsal; a forward-fix rule is written and drilled | M |
| **G8** | **No environment conformance gate** | The Secret-pruning incident ran `Running` and unreachable; readiness alone did not catch it | A missing required config key fails the gate before promotion | S |
| **G9** | **Verifier is not independent of the artifact** | Checks ship with the release; a loosened expectation hides the regression | New checks pass against the old artifact; old checks pass against the new one; a loosened check fails cross-testing | S–M |
| **G10** | **Evidence/retention unresolved** | Every check written to Evidence makes the audit kernel the largest operational writer | One Evidence per gate decision; failed-check detail bounded; retention registered | S |
| **G11** | **No outcome metrics** | No way to decide whether the gate is worth keeping | Missed incidents, flake/skip rate, and top-route coverage are published per release | S |
| **G12** | **Rollback exists for artifacts, not for definitions/data** | “Redeploy only” is not a recovery plan for a bad machine definition | Definition rollback (activate previous version) and a migration rollback drill are both demonstrated | M |

Dependencies: G2 needs G1 for production cohorts but can start against a local snapshot; G5 needs G2; G4 is independent; G6/G7/G8 are independent of G1.

## 6. Deliberately rejected options

| Option | Why not now |
|---|---|
| Kayenta-style statistical canary judge | Solves request-level traffic splitting. Our unit is the tenant, and we have no production traffic split to judge yet |
| Service-mesh / ingress traffic weights | Same reason; also requires two live API versions, which the monorepo does not produce today |
| Per-request canary (split one tenant’s users) | Causes mixed-version carts and confusing state; GitLab’s own docs warn about session affinity here |
| Pixel diffing as a gate | Non-deterministic, noisy, and the review already found there is no stable DOM block marker to anchor it |
| Per-block versioning | Multiplies the surface; the release pointer plus checks covers the same risk |
| Two full production stacks | Costs twice the infra to answer a question the pointer answers with one row |

## 7. Prior art, and what we take from it

| Source | Idea | What we take |
|---|---|---|
| [Google SRE — Canarying Releases](https://sre.google/workbook/canarying-releases/) | Canary needs a subset deployment, an evaluation, and release-process integration; before/after comparison is confounded by time | A real control arm (candidate vs current) and attributable metrics; canary only after the pointer exists |
| [GitLab — Canary deployments](https://docs.gitlab.com/user/project/canary_deployments/) | Traffic weights between stable and canary; per-user splitting confuses sessions | Split by tenant, not by request |
| [Rust Crater](https://rustc-dev-guide.rust-lang.org/tests/crater.html) / [Node CITGM](https://github.com/nodejs/citgm) | Run real consumers against the candidate build before shipping; report the extent of breakage | A storefront “crater”: sample tenants × routes against the candidate |
| [GitHub Scientist](https://github.com/github/scientist) | Run control and candidate on the same input, diff results, publish mismatches, allow explicit ignores | The differential comparison in G3, with reviewed allowlists |
| [Fowler — Parallel Change](https://martinfowler.com/bliki/ParallelChange.html) | Expand, migrate, contract; canary and blue/green are applications of it | Event renames and schema changes get an expand/contract window |
| [Pact](https://docs.pact.io/) | Consumers declare expectations; providers must satisfy them | Contract checks for events/APIs (G6) |

## 8. Documentation options: amend the RFCs, or write a new one

### Option A — amend the two RFCs

- **Eval RFC:** §6 key → `specHash@platformVersion@checkVersion`; §7 add `unverified`; §8 invert Evidence to gate decisions; §11 add `reason: "platform"`; §13 insert a preview phase.
- **Progressive-delivery RFC:** state that artifact isolation (V4) is a **precondition** for V2 channels, not a parallel track; replace the state machine’s first stage with preview verification.
- **Pros:** one decision history; smallest diff; no new document.
- **Cons:** the eval RFC becomes a check library *and* a release-gate spec; the PD RFC becomes a verification document; the missing layer has no owner; it reverses the review’s “cut to 1/5” advice by accretion.

### Option B — new RFC for the release gate

Outline:

1. Problem: deploy ≠ release; the three questions (intent, breakage, undo).
2. Release unit and artifact model (release id, immutable bundle, tenant pointer).
3. Verification layers (change-scoped, differential, contract, data, environment, observational).
4. Candidate-vs-control protocol (compare, clean, ignore, publish).
5. Change-impact map (changed paths → required checks).
6. Gate contract (`unverified` is a state; real failure blocks; unavailability is recorded).
7. Promotion ladder and rollback (pointer flip; forward-fix).
8. Outcome metrics.
9. Phasing with falsifications (replay a past incident).
10. What it supersedes (eval RFC §11/§13 partly; PD RFC §5–§8).

- **Pros:** one owner for the missing layer; old RFCs stay scoped; easier adversarial review.
- **Cons:** three documents to keep consistent; must mark superseded sections.

### Recommendation

**Option B plus three surgical amendments** — new RFC owns the release gate; eval RFC keeps only the key/`unverified`/Evidence corrections; PD RFC gets one paragraph making artifact isolation a precondition. Rationale: the gap is a layer, not a correction, and amending would bury it inside documents about other things.

**Written:** [`RFC-RELEASE-GATE.md`](./RFC-RELEASE-GATE.md) is that new RFC. Its §12 lists exactly which sections of the two older documents it supersedes; each gap below maps to a section there.

| Gap | New RFC section |
|---|---|
| G1 release pointer | §2 |
| G2 preview / control arm | §4 |
| G3 differential baselines | §4 |
| G4 skip key + `unverified` | §3, §5 |
| G5 change-impact map | §3 |
| G6 contract checks | §9 |
| G7 migration verification | §9 |
| G8 environment conformance | §10 |
| G9 verifier independence | §11 |
| G10 Evidence policy | §8 |
| G11 outcome metrics | §8 |
| G12 rollback for data | §7 |

## 9. Build sequence

Ordered by dependency and by “what makes the next step observable”.

| Phase | Ships | Falsification (must be observed) |
|---|---|---|
| **P0** | Make the browser checks typecheck and wire `EVAL_CDP_ENDPOINT`; fix `Check` shape | Forced oversized element at 375 px fails when the check exists (tracker step 15) |
| **P1** | G1: versioned bundle keys + tenant pointer + switch command | Move a tenant to a new bundle and back; the old URL still serves |
| **P2** | G2/G3: preview environment + control/candidate diff | Renderer change produces a reviewable diff; a dropped price blocks; an approved change becomes baseline |
| **P3** | G4/G5: platform-version key, `unverified`, change-impact map | Release with unchanged specs reports unverified; renderer change automatically runs render checks |
| **P4** | G6/G7: contract checks, dual-emit, migration rehearsal | Renamed event without dual-emit fails; a row-dropping migration fails rehearsal |
| **P5** | G8–G11: environment conformance, cross-testing, metrics | Missing secret key fails the gate; loosened check fails cross-testing; metrics published |

G12 (definition/data rollback) ships with P1 and P4 respectively.

## 10. Scope boundary: what this document is not

A **release workbook** is a different artifact: what a person does on release day — the checklist, the sample sizes, the exact commands, the on-call steps, the rollback procedure. It can only be written once G1/G2 exist, because today’s steps would be manual and unverifiable.

Planned outline for that document (not written):

1. Pre-flight (tests, migration dry run, artifact hash).
2. Preview run and diff review.
3. Pointer moves: internal → canary → waves, with dwell times.
4. Signals to watch and thresholds to halt.
5. Rollback: pointer, definition activation, forward-fix.
6. Post-release record (Evidence + metrics).

## 11. Open decisions

| # | Decision | Recommendation |
|---|---|---|
| D1 | Who owns the release gate? | Platform workstream; promotion is an audited action (as PD RFC Q4 already says) |
| D2 | Canary sample size and dwell time | 5 tenants, 24 h; widen only after two clean releases |
| D3 | Does a real failure block, or warn first? | Warn for the first two releases, then block on `error` checks — matches PD RFC Q3 |
| D4 | How many bundle versions retained? | 3 per tenant; rollback window is the retention window |
| D5 | Are approved diffs stored, or recomputed? | Stored: an approved baseline is a review artifact, not a transient |
| D6 | When may a breaking change ship without a compat window? | Only when no consumer crosses the release boundary; events and APIs get expand/contract |

## 12. Evidence index

| Claim | Source |
|---|---|
| 4 check ids, 3 functions | `packages/eval/src/checks/{manifest,routes,browser}.ts` |
| Browser checks uncommitted / typecheck fails | `git status`; `pnpm --filter @noname/eval typecheck` |
| No browser wiring in CLI | `packages/cli/src/commands/eval.ts` (`evaluate` call passes no `browser`/`siteBase`) |
| Overwritten bundle key | `packages/server/src/domains/tenant/worker.ts:44` |
| Hardcoded `version: 1` | `packages/server/src/domains/tenant/worker.ts:62` |
| Hardcoded platform version | `packages/server/src/domains/tenant/adapters/manifest-store.ts:48`; `redis-manifest-store.ts:26` |
| No preview environment | `docs/2026-10-31/ENVIRONMENTS-AND-PROMOTION.md` |
| Browser idle | `docs/2026-10-31/K8S-MIGRATION-STATUS.md` (step 14 done, 15 pending) |
| Skip ≠ failure | `packages/eval/src/index.ts:37` (`passed` ignores skips) |
| Evidence retention gap | `docs/2026-10-31/RFC-CRITICAL-REVIEW.md` §2.2 |
| `B1.structure` not implementable | `docs/2026-10-31/RFC-CRITICAL-REVIEW.md` §2.1 |
