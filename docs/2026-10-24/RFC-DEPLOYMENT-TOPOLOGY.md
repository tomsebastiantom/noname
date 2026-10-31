# RFC — Deployment topology: compose for development, the whole workload for production

> **Status:** **Proposed** — awaiting review.
> **Date:** 2026-10-24 (America/New_York)
> **Split from:** [`RFC-EVAL-SERVICE.md`](./RFC-EVAL-SERVICE.md) §5.5 — that RFC decides *where the eval browser runs*; this one decides *what runs where, and on what substrate*.
> **Related:** [`RFC-PROGRESSIVE-DELIVERY.md`](./RFC-PROGRESSIVE-DELIVERY.md) · [`DATABASE-MIGRATIONS.md`](./DATABASE-MIGRATIONS.md)

---

## 1. Problem

Two audiences need different things and we currently serve only one:

| Audience | Needs | Today |
|---|---|---|
| **Open-source user / new developer** | one command, everything local, no cluster | ✅ `docker-compose.yml` |
| **Production / operators** | resource limits, egress policy, independent scaling, rollback, probes | ❌ **undefined** |

Production topology exists only in prose (Dockerfiles, a compose file, and assumptions). There is no manifest anyone can review, no declared network boundary, and no way to answer "what does a production deployment consist of?" without reading the code.

The browser fleet makes this urgent: it is the first component whose *isolation* is a security property (it renders untrusted tenant content), and isolation cannot be expressed in a compose file.

## 2. Decision

**Compose stays the developer and OSS path. Kubernetes manifests become the production contract.** Same images, same environment contract, same health surface — different orchestration.

| Concern | compose (dev/OSS) | Kubernetes (production) |
|---|---|---|
| Purpose | get running in one command | run it safely, at scale, with rollback |
| Scheduling | compose | Deployments + PDB |
| Isolation | none beyond the container | namespace + `NetworkPolicy` egress allowlist |
| Scaling | none | KEDA on queue depth |
| Secrets | `.env` | Secret/Vault injection |
| Source of truth for prod | — | **`deploy/` manifests** |

The rule that keeps the two honest: **the manifests are the source of truth for production; compose is a convenience that must never encode behaviour production cannot express.** If a compose-only flag is needed to make something work, it is a bug in the production design, not a feature of composes.

**And the two states are exclusive: all services in the cluster, or none.** A cluster hosting only the browser is not a smaller step towards the same thing — it is a different, worse architecture (full control-plane cost, plus cross-boundary calls from the browser to the API and edge). See §5.

## 3. What is shared (and must never diverge)

Both substrates run the identical:

- **images** (one build, tagged once, referenced by both)
- **environment contract** — the same variable names, validated at boot (see the pending env-validation work; this is another reason it matters)
- **process entrypoints** — `index.ts` (API), `worker.ts` (jobs), `eval-worker` (browsers), never a compose-specific entry
- **health surface** — `/health`, `/ready`, `/metrics`, and for the browser pool `/pressure`
- **the eval contract** — `evaluate(scope, mode)`; the mode is a caller decision, not a deployment difference

## 4. What is deliberately different

**Isolation.** Only Kubernetes can express "this pod may reach the tenant edge and its CDN, and nothing else". Compose cannot. This is why the browser fleet's isolation is a production-only property, and why the SSRF guard is written as an eval check (`S1.no_internal_egress`) rather than assumed from the topology.

**Scaling.** Compose runs one of everything. Production scales the browser pool on queue depth (KEDA) and the workers on their own queues. A local cluster cannot validate those decisions honestly, so we validate the *caller's* back-off instead — that is our code and runs anywhere.

## 5. Manifest inventory (to author)

```
deploy/
  api/            deployment (index.ts), service, probes /health /ready, HPA
  worker/         deployment (worker.ts) — jobs: delivery, catalog builds, analytics
  e2e-worker/     deployment — agent orchestration / long jobs, separate queue
  eval/           deployment (eval worker, no browser), queue concurrency 4
  edge/           deployment + the only public ingress
  client/         static assets (CDN or nginx image), cache headers
  browser/        Chromium pool
                    deployment.yaml    resources, probes (/pressure), shm 2g, fonts
                    service.yaml       CDP endpoint
                    networkpolicy.yaml egress: tenant edge + CDN only; deny private ranges
                    pdb.yaml           keep one replica during disruption
                    scaledobject.yaml  KEDA on eval queue depth, warm floor 1
  jobs/
    migrate.yaml    Job that must complete before rollouts
    seed.yaml       Job (demo/first-run only)
  kustomization.yaml
  README.md         what each object is for, and what cannot be tested locally
```

### The rule: all in, or stay out

**There are two production states and no hybrid.**

| State | Runs | When |
|---|---|---|
| **Compose** | infra + every service, no cluster | local dev, OSS first-run |
| **Cluster** | every service + eval + browser, infra managed or external | production, after one cutover |

**No half-cluster.** A cluster that hosts only the browser is the worst of both: the full control-plane cost, and the browser must then reach the API and edge *across a boundary* (service DNS, ports, TLS, policy on both sides) — exactly the glue that produces "works locally, fails in prod".

**Scope: production.** Locally a split is allowed and often necessary — stateful infrastructure (Postgres, ClickHouse, Zitadel, Keto, Vault, Nango, S3) is heavy and is not what we are validating, so a developer may run **infra in compose** and **the app services in a local cluster** via `podman kube play`. That is a dev convenience, not a production shape.

The browser is the **reason** a cluster becomes necessary (it is the only workload that must execute untrusted tenant content, so it is the only one that needs enforced egress policy). It is **not** the only thing that belongs in one. **The trigger is the browser; the answer is the workload.**

### Two developer tracks, one artefact set

| Track | Runs | What it actually validates |
|---|---|---|
| **A — compose** (default) | everything, one command | the product works at all |
| **B1 — app in a local cluster** | infra in compose + app in `podman kube play deploy/` | **app parity only**: pod shapes, probes, resource limits, service DNS between app services, the CDP hop, migrate-Job ordering |
| **B2 — everything in a local cluster** | infra + app + browser inside Kubernetes | **real deployment parity**: StatefulSets/PVCs, init ordering, secrets as Secrets, DNS names that differ from compose, data-service networking |

**B1 is not "deployment parity" — it is app parity, and the distinction matters.** It cannot validate: Postgres/ClickHouse as StatefulSets, PVC behaviour, secret injection, compose-to-cluster DNS differences, or NetworkPolicy (no enforcing CNI). Calling it parity would let us believe the cutover is rehearsed when only half of it is.

### Capacity: measured, not assumed

An earlier draft of this document claimed a local cluster needs "12 GiB+". That was an estimate and it was **wrong**. Measured inside the `noname` VM (2026-10-31):

```
Mem:  7797 MB total   |  used 1853 MB  |  buff/cache 5896 MB  |  available 5943 MB
Swap: 2048 MB, unused |  nproc: 8
heaviest: clickhouse 868 MB · podman 660 MB · node(API) 498 MB · zitadel 183 MB · vault 158 MB
```

The **whole compose stack uses ~1.9 GB of 7.8 GB**, leaving ~5.9 GB available. So:

| Variant | Estimated need on top of the current 1.9 GB | Fits? |
|---|---|---|
| **B1** — app pods in `podman kube play` (no control plane) | ~1 GB | **comfortably** |
| **B2-lite** — k3s/k3s-class control plane + app pods | ~1.5–2 GB | **yes, ~2 GB headroom** |
| **B2 + browser pool** (4 contexts ≈ 1.5–2 GB) | ~3.5–4 GB | tight, and it competes with the host |

Two corrections that follow:

- **The `--memory 6144` flag did not produce a 6 GiB VM** — WSL reports 7.8 GB and manages memory dynamically, so treat the flag as advisory, not a hard cap.
- **"Needs more RAM" is not a reason to defer a local cluster.** The reason to prefer B1 first is that `podman kube play` has **no control plane to pay for** and validates the manifests directly — not capacity.

The capacity answer is therefore: **work with what we have; measure before buying.**

**Why B1 first, then:** not capacity (measured above) but overhead — podman kube play has no control plane, so it validates the same manifests for free. B1 is worth having because the failures that actually bite at cutover — probes, limits, ordering, DNS between app services — are exactly what it exercises. It is not a substitute for one B2 run before the real cutover.

Both tracks use **the same images and the same env contract**; the manifests are the single artefact applied locally or in production. That is what stops track B from becoming a second, divergent system.

### When each track is *required*

Compose is two things — an **onboarding shortcut** and a **fast loop** — and neither of them is "the way we validate a deployment". That distinction is the practical answer to "shouldn't real work happen on the cluster?":

| Kind of change | Required track | Why |
|---|---|---|
| Product code: domains, checks, UI, capabilities | **A — fast loop** (processes or compose) | substrate-independent; a kube-play cycle per edit would cost minutes for no signal |
| Manifests, probes, resource limits, Jobs, ingress, secrets, network policy, service DNS | **B — cluster** (B1 minimum, B2 before cutover) | these *are* the substrate; compose cannot express most of them |
| Anything shipping to production | **production cluster only** | compose must never be the shape we ship |

So: **compose is never the answer for a deployment question, and always acceptable for a feature question.** Requiring a cluster for every edit would make the loop slow enough that people route around it — the same failure mode as a flaky gate.

If cluster-first development becomes a goal, the missing piece is tooling, not policy: file sync / hot reload into pods (Skaffold, Tilt, DevSpace, or `kubectl cp`-style watch). Without that, the inner loop is rebuild-image-and-redeploy per change, which is why most teams keep the fast loop outside the cluster and use it for integration and parity checks.

| Need | Workloads |
|---|---|
| Enforced egress / SSRF deny | **browser** (untrusted content) |
| Memory-heavy and churny | browser, eval worker |
| Queue-driven scaling | worker, e2e-worker, eval worker |
| Horizontal scale + self-healing | api, edge, client |
| Ordered execution before rollout | migrate job, seed job |

### Preconditions for the cutover (the real work list)

Because the cutover moves the whole workload in one step, these must all be true first. None of them exist today.

| # | Precondition | Status |
|---|---|---|
| 1 | **An image per service** — api, worker, e2e-worker, edge (`Dockerfile`, multi-stage, non-root) | ❌ none exist |
| 2 | **One registry, one tag**, referenced by compose *and* manifests so the two substrates cannot diverge | ❌ |
| 3 | **Env contract validated at boot**, injected as Secret/Vault instead of `.env` | ⚠️ env validation is still unbuilt (Phase 1.6 / risk S17) |
| 4 | **`migrate` and `seed` as ordered Jobs** — they exist as commands but have no Job semantics (must complete before rollout, and be re-runnable) | ⚠️ commands exist, Job shape does not |
| 5 | **Probes** — `/health`, `/ready` shipped ✅; `/pressure` only for the browser | ⚠️ browser probe is specified, not built |
| 6 | **Egress policy** — NetworkPolicy for the browser, deny private ranges | ❌ |
| 7 | **Ingress** — edge is the only public surface; everything else internal | ❌ |
| 8 | **Secrets bootstrapping** — `init:zitadel` writes `.env` and `wrangler.toml`; in a cluster that becomes a Job whose output is a Secret | ❌ |

That list is why the cutover is a project, not a deployment: **six of eight are missing**, and two of them (env validation, images) are pre-existing gaps rather than new work.

## 6. Local reality — what we can and cannot mirror

Measured on this machine (2026-10-24):

| Fact | Consequence |
|---|---|
| `kubectl`, `helm`, `kompose` installed; **no** `minikube`/`kind`/`k3d` | a cluster is an install away, not a flip |
| Host: **15.7 GB** total, ~5.1 GB free | one VM, not two |
| Podman **WSL machines cannot be resized** (`changing CPUs not supported`) | capacity must be chosen at `machine init` |
| Old default machine: 2 GiB, 0 containers, 0 volumes | it was empty; replaced by `noname` (6 CPU / **6 GiB**) |

Three local rungs, in order:

1. **compose** — build the checks; tier 0/1 needs no browser at all.
2. **`podman kube play deploy/`** — proves the *pod* shape for **the whole workload**: resource limits, probes, shared network namespace inside a pod, the CDP hop, the migrate job. Same YAML as production, no control plane. This is the closest thing to a rehearsal of the cutover.
3. **`minikube start --driver=podman`** — only when KEDA/PDB behaviour must be validated, and only after freeing RAM (the default machine must be stopped/removed first).

**Honest limits of the local mirror:** `NetworkPolicy` is only enforced by a CNI that implements it (Calico/Cilium), and minikube/kind defaults often do not. So **"egress is blocked" can never be proven locally** — only that the app-level guard refuses internal endpoints.

## 7. Non-goals

- Helm charts. `kubectl apply -k` over `deploy/` is enough; a chart adds templating we do not need yet.
- Replacing compose for OSS users. It is the first-run experience and should stay one command.
- **A hybrid: some services in the cluster, some outside.** See §5.
- Running a cluster in CI. The gate runs against the app, not the substrate.
- Multi-region / multi-cluster. Not before one production cluster exists.
- Migrating Postgres/ClickHouse into the cluster. Managed or external for now; this RFC is about the compute plane.

## 8. Sequencing

**Before the cutover (works today, no cluster):**

1. Author `deploy/**` for the full workload; review it like code — it *is* the production contract.
2. `podman kube play deploy/` against the local stack: confirm probes, limits, the CDP hop, and the migrate Job ordering.
3. Add `S1.no_internal_egress` and fail it deliberately, proving the check is real.

**Closing the preconditions (§5):**

4. Images + registry (§5 items 1–2) — the largest piece, and independent of everything else.
5. Env validation (§5 item 3) — already on the Phase 1 list as S17.
6. Jobs for migrate/seed, ingress, egress policy, secret bootstrap (§5 items 4, 6–8).

**The cutover itself:**

7. One environment, all services, migrate Job first, then rollouts, gated by the eval sweep on a canary cohort.
8. Only after that: minikube/podman-driver to validate KEDA and PDB decisions.

**Do not** start with the browser. It is the trigger for needing a cluster, not the first thing to move.

## 9. Open questions

| # | Question | Recommendation |
|---|---|---|
| Q1 | Registry for images: GHCR, or build-in-cluster? | GHCR, one tag referenced by compose and manifests |
| Q2 | Namespace strategy: one `noname`, or per-environment? | one `noname` namespace now; per-env later |
| Q3 | Secrets: Kubernetes Secret, or Vault injection (Vault is already in the stack)? | Vault now (it exists), Secret only for bootstrap |
| Q4 | Dedicated node pool / taints for browser pods? | yes in production (memory-heavy, untrusted), not locally |
| Q5 | Local cluster: minikube vs kind (podman provider)? | minikube `--driver=podman` — fewer moving parts on Windows/WSL |
| Q6 | Do browser pods get read-only rootfs? | yes; Chromium needs only `/tmp` and `/dev/shm` |

## 10. What this buys, in one line

A reviewer can read `deploy/` and answer *"what runs in production, with what limits, reachable from where, scaled by what?"* — a question that currently has no answer outside this document.
