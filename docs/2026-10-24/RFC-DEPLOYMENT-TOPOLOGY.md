# RFC — Deployment topology: compose for development, Kubernetes for production

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
  browser/
    deployment.yaml        Chromium pool, resources, probes (/pressure), shm, fonts
    service.yaml           CDP endpoint
    networkpolicy.yaml     egress: tenant edge + CDN only; deny private ranges
    pdb.yaml               keep one replica during disruption
    scaledobject.yaml      KEDA on eval queue depth, warm floor 1
  eval/
    deployment.yaml        eval worker (no browser), queue concurrency 4
  README.md                what each object is for, and what cannot be tested locally
```

Deliberately **not** included yet: API/edge/client manifests. They are stateless and can follow once the browser fleet proves the pattern; adding them now would be a bigger surface with no new lesson.

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
2. **`podman kube play deploy/browser/*.yaml`** — proves the *pod* shape: shared network namespace, resource limits, probes, CDP between two containers. Same file, no control plane.
3. **`minikube start --driver=podman`** — only when KEDA/PDB behaviour must be validated, and only after freeing RAM (the default machine must be stopped/removed first).

**Honest limits of the local mirror:** `NetworkPolicy` is only enforced by a CNI that implements it (Calico/Cilium), and minikube/kind defaults often do not. So **"egress is blocked" can never be proven locally** — only that the app-level guard refuses internal endpoints.

## 7. Non-goals

- Helm charts. Two deployments do not need a chart; `kubectl apply -k` over `deploy/` is enough until a third consumer appears.
- Replacing compose for OSS users. It is the first-run experience and should stay one command.
- Running a cluster in CI. The gate runs against the app, not the substrate.
- Multi-region / multi-cluster. Not before one production cluster exists.
- Migrating the dev database into a cluster. Postgres stays where it is for now; this RFC is about the compute plane.

## 8. Sequencing

1. Author `deploy/browser/**` and `deploy/eval/**`; review them like code (they *are* the production contract).
2. `podman kube play` the browser pod against the local stack; confirm CDP, probes, shm, fonts.
3. Add `S1.no_internal_egress`; fail it deliberately to prove the check is real.
4. Free RAM (stop/remove the old machine), install minikube with the podman driver, and validate KEDA only once the pool's contract is already trustworthy from step 2.
5. Only then decide whether API/edge/client follow into manifests.

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
