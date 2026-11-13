# Decisions recorded — B7, D9, D5/E20 (step 8)

> **Status:** **decided 2026-11-12** · **Scope:** roadmap step 8. These three were open in
> [`../2026-11-07/PENDING-DECISIONS.md`](../2026-11-07/PENDING-DECISIONS.md) (as D6, D9, D5) and were blocking the
> gate semantics that steps 5–6 now implement.
> **Why now:** the wave write path (step 6) refuses `unverified` tenants, and that refusal had no written decision
> behind it. Code that encodes a policy must name the policy.

---

## B7 — visual rubric: **drop** (decision D6)

**Decision.** No `B7`. The catalogue keeps `B6` (contrast, measurable) and human review for “looks broken”.

**Why.** Both alternatives import a failure mode this system exists to avoid:

| Rejected | Reason |
|---|---|
| Vision model (A) | non-deterministic, cost per run, prompt/model drift — a verdict that cannot be reproduced is not evidence |
| Visual regression service (B) | another service, curated baselines, renderer/state noise; the diff is only as good as the baseline upkeep |
| **Drop (C)** | nothing to maintain; visual judgement stays with humans, where it already is |

**Consequence.** `B7` remains absent from the check registry — not “unimplemented”, but **deliberately out of scope**.
A future regression service would be a new decision, not a backlog item.

## D9 — `unverified`: **fail closed now; human ack later** (blocked by design gap)

**Decision.** A tenant whose verdict is `unverified` is **skipped** by a wave. There is no acknowledgement path yet.

**Why.**

- The gate currently computes `passed` without considering `unverified`, so a run can be `pass` with `unverified > 0`.
  Treating that as promotable would let an infrastructure outage (no browser, edge down) silently become a pass.
- “Human ack” is the right long-term answer, but an ack is only meaningful if it is **per tenant and per release**,
  names the actor, lists exactly which checks were unverified, and lands in Evidence. None of that exists.
- Shipping “ack” as a boolean flag on the rollout request would be a rubber stamp — the failure mode option B warns
  about.

**Consequence, stated plainly.** A tenant that could not run one required check is currently **not promotable at all**.
That is conservative and occasionally annoying; it is not silently wrong. The ack feature is a separate block with
its own evidence requirement:

1. `POST /api/releases/:id/ack` with `{ orgId, checks: [...] , reason }`, platform-operator only;
2. validate the named checks are exactly the unverified ones from the verdict's run;
3. write an audit row (`platform.release.unverified_acknowledged`) **before** the wave runs;
4. the wave accepts `unverified` only when such an ack exists for that release + org.

**Binding constraint (contract/data).** Unverified checks of level `contract` or `data` are **never** ackable — the
gate blocks them regardless of any acknowledgement. That part is not deferred.

## D5 / E20 — checkout: **contract test now, staging smoke later, never in eval** (decision D5)

**Decision.**

| Now | Later | Never |
|---|---|---|
| Contract test of the mapping + guard: a fake provider returns `{ externalCheckoutId, redirectUrl }`, and the normalised `checkout.session.completed` event drives the cart to `paid`; replay must not double-transition | One staging run against the tenant's configured provider (real checkout, real webhook) once an account exists | A provider check inside eval — it would put an external dependency and credentials inside the release gate |

**Why.** The half we own is the mapping from a provider event to our state machine; that is deterministic and belongs
in tests. The half we do not own (Stripe's sandbox) belongs in staging, where a failure means “the provider changed”,
not “this release is bad”.

**Consequence.** `B5` stays add-to-cart. `E20` is closed as “contract test + staging smoke”, so eval does not grow a
provider dependency and the gate stays runnable offline.

---

## Effect on the implemented steps

| Step | Assumption now written down |
|---|---|
| 5 — verdict lookup | `unverified` ≠ pass; `missing` ≠ pass |
| 6 — wave write path | `unverified` and `no_verdict` are skipped; there is no override |
| 7 — platform audit | the ack, when it exists, must be an audited event before the wave, not after |

## Still open elsewhere

D3 (deferred), D10 (worker split), D11 (cost), D12 (retention), D13 (checkout provider choice), D14–D17 (implemented).
