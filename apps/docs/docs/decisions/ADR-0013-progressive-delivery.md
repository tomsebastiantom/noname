---
title: ADR-0013 — Progressive delivery for platform artifacts
sidebar_position: 13
status: proposed
owner: platform delivery
recorded: 2026-10-24
last_verified: 2026-10-24
source_documents:
  - docs/2026-10-24/RFC-PROGRESSIVE-DELIVERY.md
  - docs/2026-10-24/DATABASE-MIGRATIONS.md
  - docs/2026-10-23/CODE-VERIFIED-STATUS.md
implementation_evidence:
  - packages/server/src/domains/machines/schema.ts
  - packages/server/src/domains/machines/engine.ts
  - packages/server/src/domains/tenant/ports.ts
  - packages/server/src/domains/flags/schema.ts
  - packages/seeding/src/profiles/commerce/index.ts
---

# ADR-0013: Progressive delivery for platform artifacts

- **Status:** proposed
- **Date:** 2026-10-24
- **Detail:** `docs/2026-10-24/RFC-PROGRESSIVE-DELIVERY.md` (repository document — lives outside this site, so it is referenced as a path rather than a link)

## Context

Every platform change reaches **all tenants at once**, and none of it is reversible.

`machine_definitions` is `(org_id, name, definition jsonb, created_at, updated_at)` — **no version column**. Writing a definition instantly changes behaviour for every instance of that machine at that tenant, including carts already in flight, with no way to revert. Tenant catalog bundles record `version` plus `platform {version, hash}` (`domains/tenant/ports.ts`), so the *identity* of what a tenant runs is known — but the previous bundle is not retained and there is no promotion control.

Two incidents already show the failure mode:

1. The stored cart definition held four states while `cart.json` declared nine, making `commerce.orders.cancel`, `.fulfill` and `.refund` unreachable through the real path. Nothing reported it; only a hand-written seed check caught the drift.
2. `inventory_reservation` existed in the database only because it had been inserted by hand — a fresh environment had no inventory machine at all.

The strategic risk is larger than either: the platform's premise is "fix a block once, every tenant improves". Without a gate and a rollback, every improvement is an unverified blast radius across all customers simultaneously.

## Decision

Adopt four mechanisms, each copying a proven pattern rather than inventing one:

1. **Version machine definitions; pin in-flight instances** to the version they started on, with migration as an explicit audited action (Camunda, Temporal).
2. **Per-tenant channels** — `internal` → `canary` → `stable` — with rollout by rule rather than by hand (Unleash).
3. **An eval harness as the promotion gate**: routes resolve, blocks render at 375/768/1440, a11y basics hold, the commerce path completes (Argo Rollouts analysis semantics).
4. **Versioned bundle keys plus a per-tenant pointer**, so rollback is a repoint rather than a rebuild (Kubernetes revisions).

**Compatibility policy: none.** The platform is pre-production, so we carry no compat shims, deprecated fields, dual-read paths or API versioning, and we deliberately reject Camunda's "keep dependent artifacts backwards compatible" advice. Breaking changes are made in place. Two things remain that are *not* compatibility promises: instance pinning (protects work already in flight) and rollback (recovers from a bad change). The safety net for breaking changes is the gate plus rollback, not a compatibility layer.

## Consequences

**Positive**

- A bad definition or block change can no longer alter orders mid-flow, and can be rolled back.
- Platform upgrades become a cohort progression (`internal` → `canary` → `stable`) with an automatic halt on regression.
- "The app works" becomes a measured, per-tenant claim rather than an inference from the absence of complaints.
- Where Argo Rollouts and Flagger must *infer* health from metrics, this gate *asserts* behaviour: route resolves, block renders, purchase completes.

**Negative**

- More moving parts: definition versions, active pointers, rollout records, an eval package and a browser worker.
- Browser evaluations cost compute and can be flaky if assertions drift toward visual fidelity.
- Until the gate exists (phases P0–P2), breaking changes still rely on manual verification.

**Neutral**

- Nothing in this decision changes the tenant-facing API shape; it changes how changes are shipped.

## Alternatives considered

| Alternative | Why not |
|---|---|
| Deploy everything at once and fix forward | This is today's behaviour, and it is what makes the platform promise unsafe |
| Backward-compatible change policy instead of versioning | Rejected for now: pre-production, and compat layers slow every change while the gate can catch breakage directly |
| Pixel-diff visual regression as the gate | High flake rate, learned-ignored. Structural assertions first |
| Version the component catalogue per tenant | Multiplies surface for no gain; the gate catches block breakage directly |
| A general CI/CD product | Out of scope — this is scoped to tenant apps and platform artifacts |

## Follow-ups

1. Migration: `machine_definition_versions`, `machine_instances.definition_version`, `machine_definition_active`.
2. `packages/eval` with tier 0 (manifest), tier 1 (routes), tier 2 (browser: render, a11y, commerce) and a CLI.
3. Rollout records + channel column + gate between cohorts; halt and repoint on failure.
4. Retire a definition version only when no instance references it, and report drains.

Each phase is accepted only with a demonstrated falsification: a deliberate break that the mechanism must catch. Details in the RFC §11.
