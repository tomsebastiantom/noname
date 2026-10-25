# RFC — Progressive delivery for platform artifacts (versioning, canary, eval-gated promotion, rollback)

> **Status:** **Proposed** — awaiting review. No code written yet.
> **Date:** 2026-10-24 (America/New_York)
> **Author:** platform workstream (2026-10-15 → 2026-10-24 remediation)
> **Related:** [`RFC-EVAL-SERVICE.md`](./RFC-EVAL-SERVICE.md) (the gate this RFC depends on) · [`DATABASE-MIGRATIONS.md`](./DATABASE-MIGRATIONS.md) · [`../2026-10-23/CODE-VERIFIED-STATUS.md`](../2026-10-23/CODE-VERIFIED-STATUS.md) · [`../2026-07-25/TENANT-MF-SECURITY.md`](../2026-07-25/TENANT-MF-SECURITY.md) · [`../2026-07-04/ARCHITECTURE_DECISIONS.md`](../2026-07-04/ARCHITECTURE_DECISIONS.md)

---

## 1. Problem

Every change to the platform reaches **all tenants at once**, and none of it is reversible.

Concretely, today:

| Change | Reaches | Reversible? |
|---|---|---|
| Block / catalog code (client bundle) | every tenant on deploy | no — redeploy only |
| `machine_definitions` row | every instance of that machine at that tenant | **no — overwritten in place** |
| Content type / manifest change | every tenant app using it | no |
| Tenant catalog bundle | that tenant, on next build | no — previous bundle not retained |

`machine_definitions` is `(org_id, name, definition jsonb, created_at, updated_at)` — **no version column**. A bad definition write instantly changes order behaviour for that tenant, including carts already in flight, with no undo.

This is not hypothetical. Two incidents in this codebase alone:

1. The stored cart definition held **4 states** while `cart.json` declared **9**, which made `commerce.orders.cancel`, `.fulfill` and `.refund` unreachable through the real path. Nothing reported it; the seed's hand-written verification only caught it because someone added it.
2. `inventory_reservation` existed in the database **only because it was inserted by hand** — a fresh environment had no inventory machine at all (fixed 2026-10-24 by seeding both machine files and asserting the list against disk).

And the platform-level risk is larger than either: our whole thesis is **"fix a block once, every tenant improves"**. Without a gate and a rollback, every improvement is an unverified blast radius across every customer simultaneously.

## 2. Decision

Adopt four mechanisms, each copying a proven open-source pattern rather than inventing one:

| # | Mechanism | Prior art |
|---|---|---|
| **V1** | Version machine definitions; **pin in-flight instances** to the version they started on | Camunda, Temporal |
| **V2** | Per-tenant **channels** (internal → canary → stable) with rollout by rule | Unleash |
| **V3** | **Eval harness** + promotion gate between cohorts | Argo Rollouts analysis |
| **V4** | **Versioned bundle keys + pointer** so rollback is a repoint | Kubernetes revisions |

Plus compatibility rules for schema/manifest changes (Schema Registry: additive OK, destructive requires migration).

### Compatibility policy (explicit — and deliberately none)

**We carry no backward-compatibility burden.** The platform is pre-production: one codebase, one deploy, every tenant on the same version. So:

- **No** compat shims, deprecated fields, dual-read paths, API versioning, or migration windows for old formats.
- **No** "keep dependent artifacts backwards compatible" rule (this is where we *deliberately reject* Camunda's advice — it exists to protect long-lived production estates we do not have yet).
- When a shape should change, **change it** and update every caller in the same commit. That is the fastest correct path while nothing is in production.

**What survives anyway is not compatibility — it is runtime correctness.** Two mechanisms stay because they protect *work already in flight*, not *old code*:

| Mechanism | Why it is not a compat promise |
|---|---|
| Instance pinning (V1) | An order sitting in `awaiting_payment` must not change rules mid-flow. That is correctness for a long-running process, not support for an old format |
| Rollback (V4) | Recovery from a bad change. Distinct from tolerating old code |

The safety net for breaking changes is therefore **the eval gate (V3) plus rollback (V4)** — not a compatibility layer. If a change breaks a tenant, we see it in the gate and repoint; we do not keep the old shape alive.

**Non-goals** are listed in §10. The most important: we do **not** version the component catalogue — not for compatibility, but because per-block versioning multiplies the surface for no gain while the gate can catch breakage directly.

## 3. Prior art — what the big projects actually do

| Project | Mechanism | What we copy |
|---|---|---|
| [Camunda](https://docs.camunda.io/docs/components/best-practices/operations/versioning-process-definitions/) | Deploy = new definition version; **running instances continue on the version they started with**; migration is explicit and audited | V1 (pinning + explicit migration). We **reject** its "keep dependent artifacts backwards compatible" advice — see §2 |
| [Temporal](https://docs.temporal.io/production-deployment/worker-deployments/worker-versioning) | Pinned workflows complete on one worker version; auto-upgrade is opt-in; version drains are observable | Pinning semantics + drain visibility |
| [Confluent Schema Registry](https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html) | Versioned schemas + declared compatibility mode; incompatible evolution rejected at registration | Manifest/content-type compatibility rules |
| [Unleash](https://docs.getunleash.io/concepts/activation-strategies) | Activation strategies incl. gradual rollout + constraints on context fields (e.g. `tenantId`) | V2 targeting by rule |
| [Argo Rollouts](https://argoproj.github.io/argo-rollouts/features/analysis/) | Rollout steps with an `AnalysisTemplate`; success/failure conditions decide promotion; failing analysis aborts and rolls back | V3 gate shape (`failureLimit`, per-check conditions) |
| [Kubernetes](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_rollout/kubectl_rollout_undo/) | Revision history + `rollout undo --to-revision=N` | V4 pointer rollback |

**Where we can be better:** Argo and Flagger must *infer* health from metrics (error rate, latency) because they cannot see inside the app. We can *assert* it — route resolves, block renders at 390px, cart reaches `paid`. Our gate is **deterministic where theirs is statistical**.

---

## 4. V1 — Definition versioning and instance pinning

### Data model (migration `0001`)

```sql
-- append-only history; `id` stays the identity used by instances
create table machine_definition_versions (
  id uuid primary key default gen_random_uuid(),
  org_id text not null,
  name text not null,
  version integer not null,
  definition jsonb not null,
  definition_hash text not null,
  created_at timestamptz not null default now(),
  unique (org_id, name, version)
);

-- which version each instance runs under
alter table machine_instances
  add column definition_version integer;

-- which version a tenant's machine currently deploys to
create table machine_definition_active (
  org_id text not null,
  name text not null,
  active_version integer not null,
  updated_at timestamptz not null default now(),
  primary key (org_id, name)
);
```

`machine_definitions` is retained during transition as a view/compat shim, or replaced in one migration since we are pre-production.

### Semantics (Camunda default)

- Writing a definition with a changed `definition_hash` creates a **new version** and points `machine_definition_active` at it.
- New instances record `definition_version = active_version`.
- **Existing instances keep their `definition_version`** and continue under it — a definition change cannot alter an order mid-flow.
- `transition()` resolves the definition by `(orgId, machineName, instance.definition_version)`.
- Moving instances is an explicit, audited operation: `migrateInstance(orgId, instanceId, toVersion)` writing an Evidence record. **Not automatic** — see §9.1 for the decision and the agent boundary (agents propose a plan, humans execute).

### Why this matters most

It removes the exact hazard that produced the 4-vs-9-state incident, and it makes rollback of business logic possible for the first time.

## 5. V2 — Channels and canary targeting

### Data model (same migration)

```sql
alter table tenants add column channel text not null default 'stable'
  check (channel in ('internal','canary','stable'));
```

`tenants` may be `organizations` in today's schema — the column lands on whichever table owns tenant identity; the decision is in §9 Q2.

### Targeting by rule, not by hand

- Rollout plan: `internal` → `canary` (N tenants) → `stable`, driven by a repeatable job (same pattern as the retention reapers and the transition relay).
- Per-tenant **kill switches** use the existing org-scoped flags (`unique (org_id, key)`), e.g. `platform.block_v15_enabled`. Flags stay for *behaviour toggles*; `channel` is configuration, not experimentation.
- Bundle rebuilds are enqueued **per channel**, so promotion is a cohort, never a global switch.

## 6. V3 — The eval gate (delegated)

Promotion is decided by something that can say *"this tenant's app actually works"* — not by the absence of complaints.

**The service design is a separate document:** [`RFC-EVAL-SERVICE.md`](./RFC-EVAL-SERVICE.md). It owns the check catalogue, tiers, result contract, isolation rules, determinism strategy and cost model. This RFC only fixes the *interface* the rollout depends on:

```
evaluate(scope) → { passed, checks[], evidenceId }
```

- `passed` is derived: **no blocking failure ⇒ passed.** Warnings never block.
- Called with `reason: "cohort"` at each promotion step, and `reason: "sweep"` nightly to catch regressions caused by platform changes.
- Deterministic, not statistical: unlike Argo Rollouts and Flagger we do not infer health from error rates — we assert that routes resolve, blocks render at 375/768/1440, a11y holds, and the purchase completes.
- Cost is bounded by tiers and change detection, so "verified on every publish" stays affordable.

Nothing else about eval belongs here; if it cannot be expressed as a gate input, it goes in the eval RFC.
## 7. V4 — Versioned bundles and rollback

- R2 keys become `tenant/<id>/<bundleVersion>/…`; the tenant row holds a pointer.
- Rollback = repoint the pointer (Kubernetes `rollout undo` shape), not a rebuild.
- Previous **N** bundle versions retained; retention is a policy constant, not unbounded growth.
- Definition rollback = set `machine_definition_active` back to a previous version (V1 already gives us the rows).

## 8. Promotion workflow (state machine)

```
build(platformVersion)              → artifact + hash
  └─ cohort=internal  → rebuild bundles → eval gate → pass?
       └─ cohort=canary (N=5..10) → eval gate → pass?
            └─ cohort=stable (waves)  → eval gate → pass? → done
any gate fails → auto-halt + alert + (optional) auto-pin cohort to previous version
```

A **rollout** is a record: `{ id, platformVersion, artifactHash, cohort, state, startedAt, gates: [...] }`. Halting is always available; advancing requires a green gate.

## 9. Open questions (need a decision before implementation)

| # | Question | Status / recommendation |
|---|---|---|
| **Q1** | In-flight instances: pin (Camunda default) or auto-migrate? | **DECIDED 2026-10-24 — pin. Auto-migration never runs automatically.** Rationale in §9.1 |
| **Q2** | Does `channel` live on `tenants`/`organizations` or as a flag? | **Column** — configuration, not experimentation. Flags stay for behaviour toggles |
| **Q3** | Is the gate blocking at launch? | **Warn-only for 2 weeks**, then blocking for routes/a11y/commerce. Never block on visual diffs |
| **Q4** | Who may promote a cohort? | A dedicated role; promotion is an audited action (Evidence), same class as capability commands |
| **Q5** | Eval-specific questions live in [`RFC-EVAL-SERVICE.md`](./RFC-EVAL-SERVICE.md) §14 | — |
| **Q6** | Tier 2 sampling policy and browser-minute budget? | Nightly changed-only + weekly full; cap concurrent contexts at 4/worker |

### 9.1 Q1 decision — pin, and why

**Pinned.** An instance records `definition_version` at creation and resolves its definition by that version for its whole life. `machine_definition_active` only affects **new** instances.

Three reasons:

1. **Auto-migration changes the rules under live work.** An order in `awaiting_payment` under a definition with states the successor lacks can end up stranded in a state it cannot leave. That is a customer-facing data fault, not a deploy artefact.
2. **Pinning and migrating are different risk classes.** Pinning is a deployment policy; migration rewrites individual live records. Collapsing them means a deploy silently edits business data.
3. **It matches the platform's existing model** — draft → review → publish. Pin is "the change applies to new work". Migration is an explicit, permissioned, idempotent, Evidence-recorded action, exactly like every capability command.

**Exception, which does not weaken the rule:** if a definition is genuinely broken (it lacks a transition in-flight instances need), pinning keeps them broken. That is the argument for migration *existing* — not for running it automatically. The repair path is an explicit migration with a dry-run report first.

**Agent boundary.** An agent may **propose** a migration plan — instances, source and target version, what would break — and may not execute it. `machine.migrate` is a capability with its own permission; agents do not hold it by default. Same principle as "an agent must never mint permissions".

**Retirement.** A version may be retired only when no instance references it, and drains must be reportable (the Temporal model). Pinning without retirement is the only form of it that causes version sprawl.

## 10. Non-goals

- **No backward-compatibility layer.** No compat shims, deprecated fields, dual-read paths or API versions. Breaking changes are made in place; the gate and rollback are the safety net (§2).
- **Not versioning the component catalogue.** Not for compatibility — because per-block versioning multiplies surface for no gain while the gate catches breakage directly.
- Not a general-purpose CI/CD product; this is scoped to tenant apps and platform artifacts.
- Not automatic semantic migration of content between schema versions (explicit migrations only).
- Not per-tenant *code* deployment — that is the tenant extension path ([`TENANT-MF-SECURITY.md`](../2026-07-25/TENANT-MF-SECURITY.md)), a separate concern with its own P0 list.

## 11. Phasing and acceptance criteria

Each phase is accepted only with a **falsification**: a deliberate break that the mechanism must catch.

| Phase | Deliverable | Acceptance (must be observed) |
|---|---|---|
| **P0** | V1 definition versions + pinning | Deploy a changed cart definition; an `awaiting_payment` instance still transitions under its pinned version; a new instance uses the new one; rollback by reactivating version N |
| **P1** | V3 gate available (see [`RFC-EVAL-SERVICE.md`](./RFC-EVAL-SERVICE.md) P1–P5) | A deliberately broken route/reference/a11y/overflow is caught by `evaluate()` and recorded as Evidence |
| **P2** | V2 channels + V4 bundle versions + gate wiring | A cohort rollout advances only on green; a failing cohort auto-halts; repointing the bundle pointer restores the previous build |

## 12. Risks

| Risk | Mitigation |
|---|---|
| Harness flakiness destroys trust | structural assertions, stable readiness marker, no pixel diffs, retries with recorded attempts |
| Browser-minute cost | tiers, change detection, sampling, concurrency caps |
| Pinning creates version sprawl | pin only definitions; retire a version when no instance references it; report drains (Temporal does this) |
| Promotion gate becomes a rubber stamp | `failureLimit` 0 for correctness checks; publish the pass rate as a product number |
| Breaking changes reach a tenant before the gate exists (phases P0–P2 land before the gate) | land P1/P2 gate before any breaking block change; until then, every breaking change is verified by hand on the demo tenant |
| Scope creep into general CI | non-goals §10 |

## 13. What already exists (evidence for feasibility)

- Playwright + Chromium installed; BullMQ in `packages/server`; metrics registry + `/ready` + `/metrics` shipped (`4d63482`, `2c80167`).
- Evidence with `correlation_id`/`causation_id` + idempotency keys (corrected 2026-10-24, `7caf130`).
- Repeatable-job precedent: retention reapers (`1128929`) and the transition relay (`3f13a64`).
- Migrations baseline + `db:generate`/`db:migrate`/`db:check` (`8cd477e`).
- Tenant catalog manifest already carries `version` + `platform {version, hash}` (`packages/server/src/domains/tenant/ports.ts`).
- Hand-rolled precedents to lift: `verifyStoredMachineDefinition()` and the storefront schema assertion inside `packages/seeding/src/profiles/commerce/index.ts`.
