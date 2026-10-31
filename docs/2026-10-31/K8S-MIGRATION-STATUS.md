# Kubernetes migration — live status tracker

> **Status:** **operational.** `node scripts/k8s.mjs status` reports **all checks passed** (exit 0): infra (9), browser, API, worker, and seeded data (`machine_definitions=2`, 44 documents, 5 pages). Compose is stopped. Remaining: client image, edge applied, eval-worker, NetworkPolicy.
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
| 7 | apply **vault**, **jaeger**, **nango** | **done** | all three `1/1 Running`; nango `/health` → `{"result":"ok"}` from an in-cluster probe pod |
| 8 | apply **zitadel** + **keto** (+ migrate job) | **done** | `keto-migrate` Job `Completed`; keto `1/1 Running`; zitadel `1/1 Running` after the service-link fix (§5) |
| 9 | re-run `init:zitadel` against cluster → new org IDs | **done** | org `397606127111569464`, project `397606456951570488`, client `397606457689833528`; assertion to ZITADEL returns **200** |
| 10 | build **Containerfiles**: api, worker, eval-worker, client, edge | **partial** | api/worker image built and loaded; browser done; **edge Containerfile + manifest written** (wrangler dev in-container; production is Cloudflare); client and eval-worker still to do |
| 11 | load images into k3s | **partial** | pipeline proven with the browser: `k3s ctr images ls` lists `localhost/noname-browser`; app images still to build |
| 12 | apply **app** Deployments + Services | **done** | api `2/2 Running`; `/ready` → `{"ready":true,"checks":{"database":true,"analyticsReady":true}}`; `/health` ok with all redis subsystems true |
| 13 | run **migrate** job, then **seed** job | **done** | `migrate` `Completed`; `seed` `Completed`; `machine_definitions=2`, 44 documents, 5 pages, evidence 2 |
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

## 4b. App-side decisions (written before the image existed)

| Decision | Why |
|---|---|
| **Dev-grade image** (`tsx` from source, not `tsc` build) | the checks are still being built; a production build pipeline would be pretending. Follow-up: compile + prune prod deps. |
| **One Secret `noname-env`** created out-of-band from `.env` | keeps credentials out of git, and `kubectl create secret … --from-env-file` is the documented way. **Must be regenerated after `init:zitadel`**, which rewrites `.env` with new IDs. |
| **`localhost-proxy` (socat) sidecar** in api + worker | `ZITADEL_ISSUER` is used as both the expected `iss` claim **and** the discovery base URL, and there is no separate JWKS override. Tokens say `http://localhost:8080` (browser reaches ZITADEL through a port-forward), and inside a pod `localhost` is the pod. The sidecar forwards pod-loopback 8080 → the `zitadel` Service, so the issuer means the same thing on both sides. Production has none of this: it uses a real DNS name. |
| **`enableServiceLinks: false` on every app pod** | same class of bug as the ZITADEL_PORT crash — a Service named `api` would inject `API_PORT`. |
| **`migrate` as a Job**, `seed` as a Job | a failed migration must be a failed object, and must complete before the API rolls out. |

## 4c. Two infrastructures are running right now

The compose stack (9 containers in `podman-noname`) **and** the cluster (9 pods in k3s) are both up, so the infra is running twice — measured 3.3 GB used of the 7.8 GB pool. That is deliberate while the migration is being proven, and it is the next thing to fix: once the cluster serves the app, `podman compose down` (without `-v`) frees the RAM and leaves compose as a documented fallback rather than a parallel system.

## 5. Known blockers and decisions taken

| Blocker | Decision |
|---|---|
| **No container registry** | images are built with `podman build` and loaded with `podman save \| k3s ctr images import`. No registry needed locally; production uses one tag. |
| **Zitadel state** | recreate in-cluster and re-run `init:zitadel`, which issues **new org/client IDs** → `.env`, `wrangler.toml`, `oidc.json` all change, and the demo data must be re-seeded. Knowingly accepted: it is the only honest path off the compose volume. |
| **Edge is a Cloudflare Worker** | `wrangler dev` is a dev tool, not a runtime. Options: (a) run `workerd` in a container, (b) run wrangler in a container — fragile, (c) keep edge outside the cluster initially and document it. **Pending decision**, tracked as a blocker rather than hand-waved. |
| **Client is a static bundle** | rspack build → nginx image. Straightforward. |
| **Flannel CNI** | `NetworkPolicy` is accepted and **unenforced**. Policy work is blocked until Calico/Cilium is installed; do not record "policy applied" as done before that. |
| **Kubernetes service-link env injection** | **Fixed with `enableServiceLinks: false`.** Kubernetes injects `{SERVICE_NAME}_PORT=tcp://…` for every Service. A Service called `zitadel` therefore set `ZITADEL_PORT`, which Zitadel's config decoder reads as `Port` and cannot parse as `uint16` — it crash-looped *after* finishing every migration. The same mechanism made `NANGO_PORT` a NaN. This is the archetypal "works in compose, fails in Kubernetes" bug and it is now documented in both manifests. |
| **Floating image tags** | `nangohq/nango-server:hosted` moved between compose's pull (2026-10-24) and the cluster's (2026-10-31): the newer digest additionally requires `NANGO_PORT`. Set explicitly now; pin by digest before production. |
| **`pnpm exec` re-installed the workspace at every container start** | `pnpm` resolved the workspace and ran an install (21 s + network) before the app started. Fixed by calling `/app/node_modules/.bin/tsx` directly. `packageManager: pnpm@11.12.0` is now pinned in the root `package.json` so the container cannot pick a different major than the host. |
| **The image baked in `.env`** | `COPY . .` carried `packages/server/.env` into the image and `load-env` injected 9 vars at startup — credential leakage *and* stale localhost URLs shadowing the Secret. Fixed with `**/.env` in the ignore file. |
| **Excluding `.env` then removed required config** | the R2/S3 asset-storage vars live only in `packages/server/.env`, so the API crash-looped with `Asset storage requires R2/S3 config`. Fixed properly: `scripts/cluster-env.mjs` flattens **both** env files (root wins, package-local fills gaps) and rewrites loopback → Service DNS, keeping ZITADEL on localhost:8080 for the socat sidecar. |
| **`kubectl apply` pruned the Secret** | declaring `noname-env` inside `api.yaml` deleted the 25 keys the generated Secret had. `CLICKHOUSE_URL` vanished and the adapter silently fell back to `http://localhost:8123` while the pod looked healthy. The Secret is now created out-of-band and is **not** in any manifest. |
| **Jobs are immutable** | changing the `migrate` Job's command failed with `field is immutable`; it must be deleted and recreated. |
| **RAM** | after stopping compose: 3.2 GB used, **4.2 GB available** for k3s + app + browser. `podman compose down` freed the duplicate stack as intended. |
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
| 15:4x | vault + jaeger Running; **nango crash-looped on `NANGO_PORT` NaN** → root cause was service-link injection + a moved image tag; fixed with explicit `NANGO_PORT` and `PORT` |
| 15:5x | keto-migrate Completed, keto Running; **zitadel crash-looped after all migrations** with `'Port' cannot parse value as 'uint16'` → `enableServiceLinks: false` fixed it; zitadel Running |
| 15:5x | **all nine infra services Running**; only app images and identity re-init remain |
| 16:1x | **compose stopped** (`podman compose down`, volumes kept) — the cluster is now the only stack |
| 16:2x | API image built (1.26 GB) → `podman save` → `k3s ctr images import`; `migrate` Job `Completed` |
| 16:4x | **api `2/2 Running`**, `/ready` true (db + analytics), `/health` ok, tracing to `jaeger:4318`. Six defects found and fixed — see §5 |
| 16:0x | app manifests written (`deploy/app/api.yaml`: api + worker + migrate Job + socat sidecar, one Secret); `deploy/app/server.Containerfile` + `.dockerignore` written; image build running (pnpm install inside the container is the slow step) |
