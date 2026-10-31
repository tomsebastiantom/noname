# Two publish scales — and why they need different verification

> **Date:** 2026-10-31 (America/New_York)
> **Status:** decision note. Amends [`RFC-EVAL-SERVICE.md`](../2026-10-24/RFC-EVAL-SERVICE.md) §11 and scopes [`RFC-PROGRESSIVE-DELIVERY.md`](../2026-10-24/RFC-PROGRESSIVE-DELIVERY.md) to platform changes only.
> **Corrects:** an earlier framing in discussion that bundled "sink + queue + synchronous gating" as one design. They are three mechanisms, and only some publishes need each.

---

## The distinction

There are **two kinds of publish**, and treating them the same is what made the eval design look bigger than it is.

| | **Tenant publish** | **Platform change** |
|---|---|---|
| Someone edits | a page, layout or content entry | a block, machine definition, or render engine |
| Blast radius | one tenant, **a handful of affected routes** | **every tenant**, every route, three widths |
| Check cost | tier 0 = µs, tier 1 ≈ 10–50 ms per route | minutes to hours |
| Frequency | constantly, by non-engineers | occasionally, by us |
| Correct mechanism | **synchronous inline gate** | **asynchronous attestation + cohort** |

## The numbers that decide it

```
M4.machines   one API read per definition        ~5 ms
R1.resolve    one HTTP read per affected route   ~20 ms
R2.blocks     same response, no extra call         ~0 ms
```

A merchant publishing one page touches **one route** → ~25 ms. Even a 20-route publish is under a second.

A platform change is `tenants × routes × widths` → **minutes to hours**. That cannot be synchronous, and it must be sampled and staged.

So the expensive part of eval (tier 2, the browser) is precisely the part a tenant publish **does not need**:

| Check tier | Tenant publish | Platform change |
|---|---|---|
| tier 0 manifest | **synchronous, blocking** | yes, per cohort |
| tier 1 routes | **synchronous, blocking** (affected routes only) | yes, per cohort |
| tier 2 browser | async afterwards, **never blocks** | yes, sampled |

## What each one needs

**Tenant publish — synchronous, small, already mostly built**

```
publish(page)
  → derive affected routes          (from page_tree: the edited page's own route)
  → run tier 0 + tier 1             (checks exist today)
  → all pass        → publish, mark "verified at HH:MM"
  → any real failure→ show the failure on the block, offer "publish anyway"
```

No queue. No browser at publish time. No attestation machinery.

**Platform change — asynchronous, staged**

```
build new platform version
  → cohort: internal → canary → stable
  → per cohort: sweep tenants × routes (tier 1, plus sampled tier 2)
  → produce a report per tenant, stored as Evidence, keyed by specHash@platformVersion
  → promote only if the cohort's reports are green; halt + repoint on failure
```

That is where the queue, the browser pool, the channels, the cohort logic and the rollback pointer belong — **and nowhere else**.

## The rule that must be written down either way

**What happens when verification itself is unavailable?** (edge down, API 500, browser pool saturated)

| Choice | Consequence |
|---|---|
| Fail **closed** | an edge outage blocks all publishing — an availability risk |
| Fail **open, explicitly** | publish proceeds marked **"unverified"**, surfaced to the merchant and counted in metrics |

Take the second, with one exception:

> **A check that returns a real failure blocks. Only the inability to check lets a publish through — and it is recorded as unverified, never silently green.**

Silence is not success; that rule already exists in the eval RFC for skipped checks, and it applies here to skipped *verification*.

## What this changes

1. **The first slice shrinks to:** affected-route derivation + a synchronous tier 0/1 gate on tenant publish. The checks already exist; this is the wiring.
2. **The queue moves out of the critical path** — it is needed by the platform sweep, not by a merchant saving a page.
3. **The browser pool is decoupled from publishing entirely.** It only ever runs in the sweep or an async tenant check.
4. **Cohorts/attestation are scoped to platform changes**, which is also the correct reading of the progressive-delivery RFC: it is about *our* releases, not about a merchant's edit.

## Why the distinction is load-bearing

If both publishes share one mechanism, the design must satisfy the harder case — so it inherits a queue, a browser, attestations and cohort logic **for an action that takes 25 ms**. That is how a verification gate becomes something people route around.

Conversely, if the platform change is treated as a big tenant publish, a block upgrade ships to every tenant at once with nothing verifying it — the exact failure the progressive-delivery RFC exists to prevent.

**Same checks, two scales, different mechanisms.** That is the part worth keeping.
