# Critical review of the three RFCs

> **Date:** 2026-10-31 (America/New_York)
> **Reviews:** [`RFC-PROGRESSIVE-DELIVERY.md`](../2026-10-24/RFC-PROGRESSIVE-DELIVERY.md) · [`RFC-EVAL-SERVICE.md`](../2026-10-24/RFC-EVAL-SERVICE.md) · [`RFC-DEPLOYMENT-TOPOLOGY.md`](../2026-10-24/RFC-DEPLOYMENT-TOPOLOGY.md)
> **Purpose:** adversarial review before implementation. Written by the author of the RFCs, which is exactly why it is structured as *falsification attempts* rather than a defence.

---

## 1. Verdict summary

| RFC | Verdict | Why |
|---|---|---|
| **Progressive delivery** | **Split.** Build V1 + inventory now. Defer V2 (channels) and V4 (bundle pointers). V3 only as a tier‑1 slice. | V1 fixes a live correctness hazard. V2/V4 are for a fleet and a deploy pipeline that do not exist; their artefacts would be untested and rot |
| **Eval service** | **Cut to ~1/5 size.** The MVP is two HTTP checks and one browser check against one tenant. | The design specifies seven check families, three modes, five layers, four sinks, a queue, KEDA and a container image — for a feature whose first job is "does the page render" |
| **Deployment topology** | **Keep the decision, defer the artefacts.** | The rule (compose = dev, manifests = prod contract) is right and cheap. Authoring manifests with no cluster to apply them to produces files nobody has ever run |

---

## 2. Falsification attempts (what broke)

### 2.1 `B1.structure` is not implementable as specified — **fails**

The eval RFC claims a structural advantage over Lighthouse:

> we know the spec, so we can assert **structure fidelity** — spec node count vs DOM node count — which is far stronger than "the page loaded".

**Tested:** there is no stable per-block marker in the rendered DOM.

```
grep data-(block|node|spec|component) packages/client/src/**/*.tsx  → no matches
```

So the check has nothing to count. Components render into arbitrary DOM (a `ProductGrid` expands to N cards), and no attribute carries the spec node's identity or type.

**Consequences:**

- The check cannot be written today without changing the render path (`data-block-type` + `data-block-id` emitted by the renderer for every node), and that change is a **renderer contract**, not a test detail — it must be specified, implemented once, and tested.
- Which means `B1` belongs in a later phase than tier 1, and the RFC's strongest differentiator is currently a **hypothesis with an unbuilt dependency**.
- Worse: the RFC presents it as *why we are better*, when in fact it is the one thing we cannot do yet.

**Fix:** either (a) add the marker as an explicit, separately-scoped piece of work with its own test that every registry component emits it, or (b) drop `B1` from phase 1 and stop claiming it as the structural advantage until it exists.

### 2.2 Eval Evidence would grow unbounded — **fails**

Retention in this codebase is **opt-in per table**: `shared/retention.ts` builds a gate and each table is registered with its own delete query. `platform.eval.run` is not registered anywhere, and by design cannot simply be — Evidence is append-only with an integrity hash, and deleting audit rows is a different act from sweeping operational rows.

The RFC's own numbers: 20 routes × 3 widths × 50 tenants ≈ 3 000 checks a night, each with "failing check ids and human details", written to `evidence_records`.

**Consequences:**

- The eval service becomes the largest writer to the audit kernel, which is the one table whose value depends on being trustworthy and bounded.
- "Per run → Evidence" is directionally wrong: operational results belong in **metrics**; Evidence should record **gate decisions** (publish advanced / cohort halted), not every check.

**Fix:** invert the default. One Evidence record per *gate decision* (publish allowed/denied, cohort advanced/halted) with a summary. Per-check detail goes to a metrics counter and, only on failure, a bounded set of evidence rows (failures only, capped).

### 2.3 Observers can bypass domain ports — **risk, not yet a failure**

The eval RFC says observers produce facts but never says *how* the `manifest` observer reads documents. The documents domain exposes a `DocumentStoragePort`; the eval package could equally reach for `drizzle` directly, because `packages/eval` would live inside the same monorepo with no gate stopping it.

This is precisely the boundary debt the 2026-10-10 audit catalogued (report 03 §2.2/§2.3), and the eval package would be a **new instance of it**.

**Fix:** state the rule explicitly — the manifest observer consumes the documents **port** (or the HTTP API), never the storage adapter. And note that this is exactly the class of violation the unbuilt `architecture.test.ts` is meant to catch (Phase 1.2, still not written).

---

## 3. Where the design is too big for the stage

### 3.1 The eval RFC specifies a platform to answer a question with three answers

Check families defined: `M1–M5`, `R1–R3`, `B1–B7`, plus `S1`. Count: **17 checks** before anything has been run against a real tenant.

What would actually have caught the failures we know about?

| Known failure | Check needed |
|---|---|
| cart definition drift (4 states vs 9) | `M4.machines` — tier 0 |
| dangling `page_tree` entry | `R1.resolve` — tier 1 |
| `inventory_reservation` never seeded | `M5.vocabulary` — tier 0 |

Three checks, none of which need a browser, a queue, a mode, a container or KEDA. The rest are speculation about failures we have not seen.

**Proposed MVP (deliberately small):**

```
noname eval --tenant yogastore
  ✓ M4.machines      cart, inventory_reservation consistent with files
  ✓ R1.resolve       /, /products/:slug, /collections/all, /search  (4 routes)
  ✗ R2.blocks        /collections/all renders 0 blocks (expected 3)
  2 passed, 1 failed
```

No Evidence, no metrics, no queue, no modes, no browser. That is a day of work, it replaces the seed's hand-written assertion, and it would have caught all three known defects.

Then grow, in this order, one step per **observed** need:

1. `B2.overflow` at 375px only (single width, single route) — because resizing is the most likely real defect.
2. Evidence/metrics — when the publish gate is real and someone asks "what was verified?".
3. Queue/modes — when a run takes longer than a publish can wait.
4. Browser pool — when in-process saturates (already documented as the trigger).

### 3.2 The progressive-delivery RFC builds rollout machinery without a rollout

| Piece | Needs to exist first | Exists? |
|---|---|---|
| V2 channels (`internal/canary/stable`) | more than one deployment target | **no** — one local stack |
| V4 versioned bundle keys + pointer | tenant catalog bundles in production use | **no** — tenant MF is designed, not shipped |
| KEDA / warm pool / PDB | a cluster | **no** |
| V1 definition versions + pinning | nothing | **yes** |

So V1 + the usage inventory stand alone as a correctness fix with **no dependency on any of the above**. The rest should stay in the RFC as a target and be built when its precondition is real — otherwise we author manifests and code paths that no environment exercises, which is the definition of rot.

**This is not a small point:** it is the same failure mode as the earlier "verification that passed only because it wrote SQL directly". Machinery that has never run in its intended environment provides no assurance, it only provides a feeling.

### 3.3 Two substrates is a real, ongoing tax

Compose + Kubernetes manifests + `podman kube play` = three ways to run, all of which must keep working. The RFC acknowledges the trade but under-prices it: every environment-variable change, every new service, every port has three places to be correct.

**Honest position:** compose is the only substrate that exists. Manifests become justified the moment there is a cluster to apply them to — and their first application *is* their test.

---

## 4. Gaps in all three RFCs

These are not bugs in the designs; they are missing dimensions that decide whether the designs succeed.

### 4.1 No outcome metric — the biggest gap

Every RFC defines machinery (checks, gates, cohorts, tiers) and none defines **what success looks like in numbers**. Without that, there is no way to say whether the eval gate is good, and no way to decide whether to keep investing.

Proposals, one per programme:

| Programme | Metric | Target |
|---|---|---|
| Eval gate | **false-positive rate** (checks that failed but were not real defects) | < 5% — above this, people start ignoring it |
| Eval gate | **time to detect** a broken storefront | < 1 h (nightly) / < 1 min (publish) |
| Progressive delivery | **time to roll back** a bad definition | < 5 min |
| Deployment | **time from empty VM to working storefront** | < 15 min — currently measurable: the recovery earlier took ~10 min, and failed twice on ordering |

The last one is already measurable and already valuable: we hit two ordering failures (`init:zitadel` after the API start; missing bootstrap step) that no RFC predicted.

### 4.2 No failure budget or triage policy

A nightly sweep that reports 20 failing tenants is not a feature; it is an incident with no assigned owner. Missing: how many failures halt a rollout, who triages, and what happens to a tenant that has been red for a week.

### 4.3 No cost ceiling that is enforced

The RFC caps concurrency and wall time. It does not cap **spend**: if a tenant has 400 routes, tier 2 at 3 widths is 1 200 renders for one tenant, per night. Sampling is described as a policy, not as an enforced budget per night.

### 4.4 The hard semantic case is undefined

Pinning is decided and migration is "explicit with a dry run". Undefined: **what happens when an instance's current state does not exist in the target definition?** That is the only genuinely hard case, and the RFC does not state the rule. It must be *abort that instance, report it, never force* — and a dry run must report exactly which instances would abort, before anything moves.

---

## 5. What I would change, concretely

**Progressive delivery**

1. Retitle V2/V4 as **"target, not scheduled"** so nobody builds them by default.
2. Add the migration abort rule (§4.4).
3. Name the two version axes explicitly and forbid the bare word "version": `instance.revision` (transition count) vs `instance.definition_version` (definition identity).

**Eval service**

4. Replace "per run → Evidence" with "per **gate decision** → Evidence; per check → metrics; failures may write a capped Evidence record".
5. Move `B1.structure` to a later phase and add the renderer marker as a prerequisite with its own test; stop claiming it as the differentiator until it exists.
6. State the port rule for the manifest observer.
7. Add the MVP slice and make everything else explicitly conditional on an observed need.

**Deployment topology**

8. Keep the rule; move manifest authoring to "when a cluster exists", except the `NetworkPolicy` and `Dockerfile`-level requirements that are cheap and independent.

**All**

9. Add §4.1's metrics as the acceptance criteria for the programme, not for the code.

---

## 6. Is any of this "in line with the architecture"?

Yes, with three corrections:

| RFC decision | Consistent? | Note |
|---|---|---|
| Evidence as the audit kernel | ✅ | but must not be used as a high-volume operational log (§2.2) |
| New `packages/eval` | ✅ | must consume domain **ports**, not adapters (§2.3) |
| Definition versioning in the machines domain | ✅ | Camunda-shaped, matches the existing engine |
| Channels as tenant config | ✅ | but premature (§3.2) |
| Compose + K8s | ✅ | at the cost of two substrates (§3.3) |
| Gate blocking publish | ⚠️ | must start at `warn`; an unproven gate that blocks is worse than no gate |

### Simplicity verdict

The architecture is sound; the **sequencing is not**. All three RFCs describe the end state and then propose building the end state. The correct reading of them is: V1 + three checks + the compose guide are the work; everything else is a documented destination.

**If we implement the full RFCs now, we will have built a verification platform that has never verified anything at scale, for tenants that do not exist yet, behind a deploy pipeline that has never deployed.** That is the same shape as the failures this workstream exists to fix.
