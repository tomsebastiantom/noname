# Kubernetes migration — live status tracker

> **Status:** **in progress.** Infra core running (postgres, dragonfly, clickhouse, s3 + bucket job). Browser pod Running but its image needs pinning. App images not built.
> **Date started:** 2026-10-31 (America/New_York)
> **Decision:** full move, **not** incremental — everything (infra + app + eval + browser) into the cluster.
> **Related:** [`LOCAL-K3S-CLUSTER.md`](./LOCAL-K3S-CLUSTER.md) (the cluster itself) · [`RFC-DEPLOYMENT-TOPOLOGY.md`](../2026-10-24/RFC-DEPLOYMENT-TOPOLOGY.md) (why all-in-or-none) · [`PUBLISH-VERIFICATION-SCALES.md`](./PUBLISH-VERIFICATION-SCALES.md)
>
> **How to read this:** every step has a *verification* — a command whose output proves it. A step is only
> `done` when that output was observed. Anything not observed is `pending` or `blocked`, never "should work".

---

## 1. Target topology

```
namespace: noname
├── infra      postgres · dragonfly · clickhouse · s3 · vault · nango · jaeger · zitadel · keto
├── jobs       postgres-init (dbs+extensions) · keto-migrate · s3-init · migrate · seed
├── app        api · worker · eval-worker · edge · client
└── eval       browser (CDP pool, /dev/shm 2Gi, no SA token)
```

## 2. Where things run today

| Workload | Today | Target |
|---|---|---|
| infra (9) | **podman compose** | cluster |
| app services | **host processes** (`tsx`, wrangler, rspack) | cluster |
| browser | **does not exist** | cluster, on demand |
| cluster | k3s 1 node, **empty** | hosts everything |

## 3. Step plan and status

| # | Step | Status | Verification |
|---|---|---|---|
| 1 | k3s cluster running in Ubuntu WSL | **done** | `kubectl get nodes` → `Ready` |
| 2 | namespace + core infra manifests written | **done** | files exist under `deploy/` |
| 3 | apply **postgres** | **done** | `Ready 1/1`; databases `app,keto,nango,zitadel`; extensions `pgcrypto, pg_trgm, uuid-ossp, plpgsql` |
| 4 | apply **dragonfly** | **done** | `exec deploy/dragonfly -- redis-cli ping` → `PONG` |
| 5 | apply **clickhouse** | **done** | `exec deploy/clickhouse -- clickhouse-client --query "SELECT 1"` → `1` |
| 6 | apply **s3** + `s3-init` job | **done** | pod `1/1 Running`; `logs job/s3-init` → `bucket already present` |
| 7 | apply **vault**, **jaeger**, **nango** | pending | vault `sys/health` 200, jaeger UI 200, nango `/health` 200 |
| 8 | apply **zitadel** + **keto** (+ migrate job) | pending | `zitadel ready`; keto `/health/ready` 200 |
| 9 | re-run `pnpm init:zitadel` against cluster → **new org IDs** | blocked (needs 8) | `.env` rewritten; `noname eval` still authenticates |
| 10 | build **Containerfiles**: api, worker, eval-worker, client, edge | pending | `podman build` succeeds for each |
| 11 | load images into k3s | **partial** | pipeline proven with the browser: `k3s ctr images ls` lists `localhost/noname-browser`; app images still to build |
| 12 | apply **app** Deployments + Services | pending | `/ready` 200 through the Service |
| 13 | run **migrate** job, then **seed** job | pending | 36 tables; 2 machine definitions |
| 14 | apply **browser** (CDP service) | **done** | `playwright --version` → **1.63.0** (pinned, no runtime npm download); log only `Listening on ws://0.0.0.0:3000/`; CDP **200**; `/dev/shm` **2.0G**; 50 font families |
| 15 | wire eval: `EVAL_CDP_ENDPOINT` + tier 2 check | pending | `noname eval` catches a forced overflow |
| 16 | **NetworkPolicy** enforcement | **blocked** | needs Calico/Cilium; Flannel accepts-and-ignores |
| 17 | update compose docs so track A stays accurate | pending | `DEPLOYMENT-GUIDE.md` reflects both tracks |

## 4. Created so far

| File | Purpose |
|---|---|
| `deploy/00-namespace.yaml` | `noname` namespace |
| `deploy/infra/postgres.yaml` | Deployment + Service + PVC + init ConfigMap (extra DBs & `pgcrypto`/`uuid-ossp`/`pg_trgm`) |
| `deploy/infra/dragonfly.yaml` | Deployment + Service, with the three BullMQ-critical flags |
| `deploy/browser/deployment.yaml` | browser Deployment + Service (pinned image, 2Gi `emptyDir` shm) |
| `deploy/browser/Containerfile` | official Playwright image **+ the CLI baked in** — fixes the unpinned runtime download |
| `deploy/infra/clickhouse.yaml` | Deployment + Service + local-path PVC |
| `deploy/infra/s3.yaml` | Deployment + Service + idempotent `s3-init` Job |

Deliberately **not** written yet: app manifests, because they need images first, and writing manifests for
images that do not exist produces files nobody has run.

## 5. Known blockers and decisions taken

| Blocker | Decision |
|---|---|
| **No container registry** | images are built with `podman build` and loaded with `podman save \| k3s ctr images import`. No registry needed locally; production uses one tag. |
| **Zitadel state** | recreate in-cluster and re-run `init:zitadel`, which issues **new org/client IDs** → `.env`, `wrangler.toml`, `oidc.json` all change, and the demo data must be re-seeded. Knowingly accepted: it is the only honest path off the compose volume. |
| **Edge is a Cloudflare Worker** | `wrangler dev` is a dev tool, not a runtime. Options: (a) run `workerd` in a container, (b) run wrangler in a container — fragile, (c) keep edge outside the cluster initially and document it. **Pending decision**, tracked as a blocker rather than hand-waved. |
| **Client is a static bundle** | rspack build → nginx image. Straightforward. |
| **Flannel CNI** | `NetworkPolicy` is accepted and **unenforced**. Policy work is blocked until Calico/Cilium is installed; do not record "policy applied" as done before that. |
| **RAM** | pool 7.8 GB, 5.3 GB available, all-in ≈ 3–3.5 GB + browser 1.5–2 GB. Fits; watch for OOM in staging of the browser. |
| **`traefik`/`servicelb` disabled** | exposure via **NodePort** or `port-forward` only; no Ingress controller locally by choice (saves ~200 MB). |

## 6. Log

| When | What happened |
|---|---|
| 14:0x | k3s installed in Ubuntu WSL, `Ready`, namespace `noname` created, smoke pod ran and logged |
| 15:2x | tracker created; `postgres` + `dragonfly` manifests written; browser manifests written |
| 15:2x | applied namespace + postgres + dragonfly → both `Ready 1/1`; DBs and extensions verified |
| 15:2x | applied clickhouse + s3 + `s3-init` Job → all Running/Completed; `SELECT 1` = 1; bucket present |
| 15:2x | applied browser → Running, `/dev/shm` 2.0G, 50 fonts, CDP 200; **defect found**: unpinned `npx` download of playwright 1.64.1 at container start |
| 15:3x | built `deploy/browser/Containerfile` with the CLI pinned → `podman build` ok; `podman save` (2432 MB) → `k3s ctr images import` (187s) → Deployment rolled out; `playwright --version` = **1.63.0**, no npm at startup |
