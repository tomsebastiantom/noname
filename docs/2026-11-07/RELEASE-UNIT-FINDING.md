# Release unit finding — the UI is not the release

> **Status:** finding + decision input · **Date:** 2026-11-07 (America/Toronto)
> **Why this exists:** D1 in [`PENDING-DECISIONS.md`](./PENDING-DECISIONS.md) versions the **client bundle**.
> While reviewing it we found that none of the four RFCs actually owns the *server* half of a release. This
> document records the gap, audits the RFCs against it, and defines the decisions that close it.
> **Related:** [`RFC-RELEASE-GATE.md`](./RFC-RELEASE-GATE.md) · [`RFC-PROGRESSIVE-DELIVERY.md`](../2026-10-24/RFC-PROGRESSIVE-DELIVERY.md) · [`RFC-DEPLOYMENT-TOPOLOGY.md`](../2026-10-24/RFC-DEPLOYMENT-TOPOLOGY.md) · [`RFC-EVAL-SERVICE.md`](../2026-10-24/RFC-EVAL-SERVICE.md)

---

## 1. The finding in one page

A release in this repository is **not** one artifact. It is at least four:

| Part | Versioned per tenant today? | Can it be? |
|---|---|---|
| Client bundle (catalog/UI) | No — overwritten each build | **Yes** (D1) |
| API server image | No — one deployment | **Not without multi-version serving** |
| Worker image + queue contracts | No — one deployment | Same constraint |
| Database schema | No — one database | **No** — a schema cannot be per tenant |

D1 makes the client bundle a real, rollback-able artifact. It does **not** make a release. After D1:

- a UI-only change can be canaried per tenant and rolled back in seconds;
- a server change still reaches every tenant at once;
- rolling the pointer back does not roll the server back, so a bad server release cannot be undone by the
  pointer;
- a release that contains both is only safe if the server stayed compatible with the *previous* bundle.

That last sentence is the whole finding: **the RFCs define a release as bundle + pointer, but the bundle is only
the UI.** The server is deployed as a single global version.

## 2. What each RFC assumed

| RFC | What it claims | What it actually covers | The gap |
|---|---|---|---|
| **Eval service** | “Does this tenant’s storefront work?” | Checks run against a tenant’s published output | Out of scope by design — it measures, it does not release. No claim to audit. |
| **Progressive delivery** | “Every change reaches all tenants at once and none is reversible” | V4: versioned **bundle** keys + tenant pointer; V2: channels | Treats the “platform artifact” as the client bundle. **No server versioning anywhere.** Channels would move a tenant between bundles while the API stays global. |
| **Deployment topology** | Compose = dev, Kubernetes = production contract | Images, namespaces, staging/prod | Provides the **substrate** for blue/green (two deployments, selector switch) but defines **no rollout model** and no release identity. It is infrastructure, not policy. |
| **Release gate** (new) | Release unit = immutable artifact; gate verdict; ladder | §2 says the artifact is “client bundle **and server image**”; §6 promotes in cohorts by tenant | **Internally inconsistent with the deployment reality.** A per-tenant pointer cannot point at a different server image without multi-version serving. The RFC assumes the hard part is solved by the pointer. |

So the chain is:

```
Eval      → measures (fine, not its job)
PD        → versions the UI, calls it the platform artifact
Topology  → can host two stacks, but nobody decides how they switch
Gate      → defines the right release unit, then assumes per-tenant server routing exists
```

**None of the four owns “how does a server change reach a subset of tenants?”** That is the missing decision.

## 3. Why the pointer cannot cover the server

Three constraints, in order of hardness:

1. **One database.** Tenant A cannot be on schema v1 while tenant B is on v2. Any server version must therefore
   work with the current schema — which means migrations must be expand/contract regardless of rollout model.
2. **Queue and worker skew.** A job produced by the new server may be consumed by the old worker during a
   rollback. Either jobs are backward-compatible, or there is one worker version, or jobs are versioned.
3. **N−1 compatibility.** If two server versions run at once, every API and event they share must be compatible
   in both directions. This is the price of real canary and it cannot be skipped.

Consequence: **tenant-level server canary is possible only if you accept N−1 compatibility and run multiple API
deployments.** Everything else is either whole-stack switching or feature flags.

## 4. The three layers that actually work

```
Layer 1 — PREVIEW (no tenants)
  deploy the candidate server + bundle against a production-like snapshot
  run the evals + integration tests there
  → catches most breakage before anyone is exposed

Layer 2 — BLUE/GREEN WHOLE STACK (all tenants, switchable)
  run r_16 and r_17 side by side; switch the service selector
  → rollback is a selector switch, seconds; no per-tenant skew

Layer 3 — PER-TENANT UI POINTER + FLAGS
  move the client pointer tenant by tenant (D1)
  put behaviour changes behind flags per tenant
  → progressive where it is cheap; server stays one version
```

What this buys: real pre-exposure verification, instant whole-stack rollback, progressive UI rollout, behaviour
canary. What it does not buy: “new API for five tenants only”. That is D15 option C and it is a different
architecture.

## 5. Decisions this creates

| # | Question | Recommendation |
|---|---|---|
| **D14** | What is a release? | Client bundle **+ server image + migration set + config**, one release id |
| **D15** | How does a server change reach cohorts? | **Preview verification + blue/green whole stack + flags**; per-tenant server versions only if a hard requirement appears |
| **D16** | How do migrations work across a release? | **Expand/contract mandatory**; no per-tenant schema |

Full options are in [`PENDING-DECISIONS.md`](./PENDING-DECISIONS.md) D14–D16.

## 6. What this changes in the existing documents

| Document | Change |
|---|---|
| `PENDING-DECISIONS.md` D1 | Renamed to **“UI release pointer”**, with the client-only rollback caveat and the pointer table corrected |
| `RFC-RELEASE-GATE.md` §2 | **Applied.** Release artifact set, client pointer vs server selector, and an explicit “a tenant pointer does not move the server” |
| `RFC-RELEASE-GATE.md` §6 | **Applied.** Two ladders — server selector (preview → switch → stabilise) and client pointer (internal → canary → waves) — plus ordering rules |
| `RFC-RELEASE-GATE.md` §7 | **Applied.** Rollback split into client artifact vs server artifact; two switches, two failure modes |
| `RFC-RELEASE-GATE.md` §11 | **Applied.** P3 now covers pointer + selector promotion |
| `RFC-PROGRESSIVE-DELIVERY.md` V2/V4 | **Applied.** Scope notes: channels and bundle versions are UI/behaviour, not server versions |
| `RFC-DEPLOYMENT-TOPOLOGY.md` | **Applied.** New §5b blue/green contract: two stacks, one selector, rollback by switching, expand/contract migrations |

These edits were made on 2026-11-07, in the same change set as this document.

## 7. What “solved” looks like

A release that changes API and UI is solved when all of these are observed:

1. The release has one id (`r_17`) binding server image, client bundle, migration set and checks version.
2. It runs in preview against a production-like snapshot; the eval gate and integration tests pass there.
3. The server is deployed blue/green; the selector switches; the old stack stays warm.
4. The client pointer moves per tenant after the server switch.
5. Rollback of a UI failure is the pointer; rollback of a server failure is the selector; both are seconds.
6. A migration is expand → deploy → contract, and both server versions work during the window.
7. Each move writes one Evidence record.

Until D14–D16 are chosen, implementing D1 alone would produce a system that **looks** progressive and is only
progressive for UI. That is the trap this document exists to prevent.
