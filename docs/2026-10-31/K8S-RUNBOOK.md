# Kubernetes runbook — start, check, recover

> **Date:** 2026-10-31 (America/New_York)
> **Scope:** the local k3s cluster — the **parity environment**, not the daily dev loop.
> Daily development is `podman compose up -d` + `pnpm --filter @noname/client dev` + `pnpm --filter @noname/workers dev`;
> see [`EDGE.md`](./EDGE.md) §4 and [`../2026-10-24/DEPLOYMENT-GUIDE.md`](../2026-10-24/DEPLOYMENT-GUIDE.md). Kubernetes adds a
> build → save → import → rollout cycle (3-5 minutes per change) in exchange for prod-like topology, secrets,
> Jobs and the browser fleet. Use it to *prove* things, not to iterate.
> **Companions:** [`K8S-MIGRATION-STATUS.md`](./K8S-MIGRATION-STATUS.md) (what has been moved and what is
> blocked) · [`LOCAL-K3S-CLUSTER.md`](./LOCAL-K3S-CLUSTER.md) (how the cluster itself was created) ·
> [`../2026-10-24/DEPLOYMENT-GUIDE.md`](../2026-10-24/DEPLOYMENT-GUIDE.md) (the compose path, still valid
> for OSS users).

---

## 1. The rule

**This script manages the parity environment.** For day-to-day work use compose — see the banner above.

**Run the script. Do not re-derive the steps by hand.**

```powershell
node scripts/k8s.mjs up        # bring everything up, idempotent
node scripts/k8s.mjs status    # read-only health summary, exit 0 only if all green
```

One CLI, six verbs: `up`, `status`, `identity`, `pull`, `seed`, `down`. It is **Node, not PowerShell or bash**, so
it works the same on Windows, macOS, Linux and in CI - and every external command goes through a
wrapper that **throws on a non-zero exit**, printing the command and its stderr. Earlier PowerShell versions
piped several calls to Out-Null and ignored the result, so a failed kubectl apply looked like success.

Everything below exists because a manual sequence failed at least once. Re-running the manual steps is
how this cluster gets broken: they are not all idempotent (`init:zitadel` mints **new** identity IDs;
`kubectl apply` of a Secret manifest **prunes** keys; a Job's spec is **immutable**).

## 2. Prerequisites

| Thing | Requirement |
|---|---|
| Podman machine | running (`podman machine list`); WSL, 6+ GiB. **Cannot be resized** — recreate if needed. |
| k3s | systemd unit ``k3s`` inside the **Ubuntu** WSL distro. Started by the script if stopped. |
| kubeconfig | `~/.kube/k3s.yaml`, pointed at the **WSL IP** (not `127.0.0.1`). Kept separate from the AKS/DO contexts on purpose. |
| Images | `localhost/noname-api:dev`, `localhost/noname-browser:1.63.0` — built and imported by the script when missing. |
| Env | root `.env` (written by `pnpm init:zitadel`) + `packages/server/.env` (R2/S3), flattened into `.env.cluster` by `scripts/cluster-env.mjs`. |

## 3. Up / status / down

```powershell
# up (converges; add --rebuild to rebuild images, --skip-images to forbid building)
node scripts/k8s.mjs up

# health
node scripts/k8s.mjs status

# stop the cluster without losing data
wsl -d Ubuntu -u root -- systemctl stop k3s

# stop the container VM entirely (frees everything)
podman machine stop noname

# teardown of k3s itself (destroys the cluster, not the repo)
wsl -d Ubuntu -u root -- k3s-uninstall.sh
```

The **compose** stack remains available for OSS users and as an escape hatch:

```bash
podman compose -f docker-compose.yml up -d      # volumes preserved from before the migration
```

Do **not** run both unless you are deliberately comparing behaviour — they are two copies of the same
infrastructure (measured: ~1.9 GB each).

## 4. What runs where

```
namespace: noname
  infra   postgres · dragonfly · clickhouse · s3 (+init Job) · vault · jaeger · nango · keto (+migrate Job) · zitadel
  app     api (2/2: app + localhost-proxy) · worker (2/2) · migrate Job
  eval    browser (CDP on :3000, /dev/shm 2Gi)
  web     client (nginx; /api is proxied to the edge, which runs on the HOST — not in the cluster)
```

Manifests: **kustomize** — `deploy/base/` (the shape) + `deploy/overlays/local/` (this environment). Apply with
`kubectl apply -k deploy/overlays/local`; never `kubectl apply -f deploy/`. One-shot Jobs (`identity`, `seed`)
are deliberately *not* in the overlay: they are deliberate acts, applied through the CLI.

## 5. Two designs that look odd and are not

**`localhost-proxy` (socat) sidecar.** `ZITADEL_ISSUER` is used both as the expected `iss` claim and as
the discovery base URL, with no JWKS override. Tokens say `http://localhost:8080` because the browser
reaches ZITADEL through a port-forward; inside a pod `localhost` is the pod. The sidecar forwards
pod-loopback `8080 → zitadel:8080`, so the issuer means the same thing on both sides. **Production does
not have this** — it uses a real DNS name.

**`.env.cluster` is generated, never committed.** It holds real credentials. `scripts/cluster-env.mjs`
flattens *both* env files the way `load-env.ts` does (root wins, package-local fills gaps) and rewrites
loopback to Service DNS — except `8080`, which must stay `localhost` for the reason above.

## 6. Failure catalogue — every one of these actually happened

| Symptom | Cause | Fix permanently applied |
|---|---|---|
| `'Port' cannot parse value as 'uint16'`; zitadel crash-loops **after** successful migrations | Kubernetes injects `{SERVICE_NAME}_PORT` for every Service; the Service `zitadel` set `ZITADEL_PORT` | `enableServiceLinks: false` on pods |
| `NANGO_PORT` NaN | same mechanism (Service `nango`) | `enableServiceLinks: false` + explicit `NANGO_PORT` |
| App starts, then "Cannot connect to Podman" / `dial tcp …:6443 refused` | WSL shuts the distro down when idle | detached `wsl … sleep infinity` keep-alive (a background *job* dies with the job) |
| Container installs packages on every start (21 s, network) | `pnpm exec` resolved the workspace; container had pnpm 12 vs host 11 | call `/app/node_modules/.bin/tsx`; `packageManager: pnpm@11.12.0` pinned |
| Secret loses most keys; analytics falls back to `localhost:8123` while the pod looks healthy | declaring the Secret in `api.yaml` and applying it **pruned** keys the generated Secret had | Secret is created out-of-band and appears in **no** manifest |
| `Asset storage requires R2/S3 config` | R2 vars live only in `packages/server/.env`, which the image now (correctly) excludes | `scripts/cluster-env.mjs` merges both env files |
| Credentials baked into an image | `COPY . .` carried `packages/server/.env`; `load-env` injected 9 vars at startup | `**/.env` in `deploy/app/.dockerignore` |
| `podman build` appears to hang | build context included `apps/` (1 GB of Docusaurus output) because `.dockerignore` sat outside the context root | `--ignorefile deploy/app/.dockerignore`, and `apps` excluded |
| `Job … field is immutable` | Job pod templates cannot be updated | delete the Job, then apply |
| Chromium crashes under load | 64 MB `/dev/shm` | `emptyDir` with `medium: Memory`, `sizeLimit: 2Gi` |
| Playwright version drifts from the image tag | the official image ships browsers but **no CLI**, so `npx` downloaded 1.64.x at runtime | `deploy/browser/Containerfile` bakes the CLI in at 1.63.0 |
| `wrangler dev` "works" but is not a runtime | the edge is a Cloudflare Worker | documented: production is `wrangler deploy`; the cluster runs `wrangler dev --local` only for local completeness |
| ZITADEL machine key vanishes and identity can never be re-issued | `/output` was an `emptyDir`, and the image is distroless (no shell, no `tar`) so the key cannot even be read out | `zitadel-keys` **PVC**, read via a helper pod |
| `invalid_grant: invalid assertion` with a key that is actually fine | `init:zitadel` treated the **compose volume** as the source of truth and *overwrote* a working key with one from the deleted instance (ZITADEL log: `Errors.AuthNKey.NotFound`) | a **working key wins**; the volume is only a last-resort fallback |
| `AuthNKey.NotFound` even after resetting the database | `start-from-init` writes the key only when `/output` is empty, so resetting the DB alone left the old key | reset **both together**: drop the `zitadel` database **and** delete the `zitadel-keys` PVC |
| `ERR_MODULE_NOT_FOUND` for `zod` while seeding | the image copied only some `package.json` files, so pnpm never installed the client package dependencies | copy `packages/client` and `packages/workers` manifests before `pnpm install` |
| seed Job: `fetch failed` although `busybox` reaches the API | the seeder logs in through `ZITADEL_ISSUER=http://localhost:8080`, and the Job had **no loopback proxy** | add the `localhost-proxy` sidecar to the seed Job |
| seed Job never reaches `Completed` although the logs say success | the socat sidecar kept running, so the pod stayed at `1/2` | make it a **native sidecar** (`initContainers` + `restartPolicy: Always`, k8s ≥1.29; this cluster is 1.36) |
| `Upload google.svg → 500`; API log `getaddrinfo ENOTFOUND noname-assets.s3` | `forcePathStyle` was enabled only for `localhost`/`127.0.0.1`, so a Service endpoint (`http://s3:9000`) got virtual-hosted addressing | inverted: path-style for everything except Cloudflare R2, with `R2_FORCE_PATH_STYLE` as an explicit override |
| `up` fails with "node did not become ready" right after `down` | `systemctl is-active` prints `inactive`, and the guard tested `/active/` — which matches the substring, so k3s was never started | match `^active$` exactly |
| zitadel: `no master key provided: masterkey must either be provided by file path, value or environment variable` | `ZITADEL_MASTERKEY` is ignored unless the `--masterkeyFromEnv` flag is passed | the arg is now in the manifest, with the value sourced from the Secret (`args` cannot reference `secretKeyRef`) |
| `PersistentVolumeClaim … is invalid: spec: Forbidden: spec is immutable after creation` | removing `storageClassName` from a **bound** PVC is forbidden, so an env-neutral base cannot simply drop the field | base omits it; each overlay sets it explicitly with a JSON6902 `add` patch |
| applying the overlay fails on a Job: `spec.template: Invalid value … immutable` | a Job's pod template cannot be changed — including when its credentials move from literals to `secretKeyRef` | `up` now deletes and recreates **all three** idempotent one-shot Jobs (`migrate`, `keto-migrate`, `s3-init`) before applying, so a credential rotation cannot hit this again |
| migrate Job: pod dies at **container creation**, `runc create failed` | the command pointed at `/app/node_modules/.bin/drizzle-kit`, but `drizzle-kit` is a devDependency of the *server package*, so its bin is under `packages/server/node_modules/.bin` | use the package-local bin path |

## 6b. Restart resilience, verified

Stopping k3s entirely and converging again is the test that matters, and it passes:

```powershell
node scripts/k8s.mjs down            # systemctl stop k3s
node scripts/k8s.mjs up --skip-images
#   ok node ready -> ok all nine infra -> ok Secret refreshed -> ok migrate ready
#   -> ok api /ready -> all checks passed (exit 0)
```

Data survives because it lives on PVCs (`postgres-data`, `clickhouse-data`, `zitadel-keys`), not in pods:
`machine_definitions=2`, 44 documents, 5 pages after the restart. Nothing needs a host `kubectl cp` — the
seed Job and identity bootstrap read the machine key from the `zitadel-keys` PVC.

## 7. Open gaps (reported by `node scripts/k8s.mjs status`)

| Gap | Why it is not done | Next action |
|---|---|---|
| ~~`seed data machine_definitions=0`~~ | **closed**: identity was re-issued and the seed Job completed (`machine_definitions=2`, 44 documents) | — |
| ~~`client` image~~ | **done** — `deploy/client/Containerfile` (rspack build + nginx, `/api` proxied to edge); `status` reports `index.html served` | — |
| **client `nginx` proxies `/api` to a host-run edge** | the edge is not in the cluster by design ([EDGE.md](./EDGE.md)); in-cluster, `/api` therefore 502s until `wrangler dev` is running on the host | expected — start the edge locally, or test the origin directly via port-forward |
| `eval-worker` | **not a deployment gap**: `packages/eval` is a library (4 of 16 checks) with no queue consumer, so there is nothing to deploy | implement the eval ladder (RFC-EVAL-SERVICE P1), then add the worker |
| `NetworkPolicy` | k3s ships **Flannel**: accepts the object, enforces nothing | **won't fix locally** (decision in ENVIRONMENTS-AND-PROMOTION §12): authoring policy is a staging task, verified there |

## 8. Session hygiene — what NOT to redo

| Do not | Why |
|---|---|
| re-run `pnpm init:zitadel` unless identity is meant to change | it mints **new** org/client IDs; `.env`, `wrangler.toml`, `oidc.json` and the cluster Secret all change, and existing tokens become invalid |
| `kubectl apply` any Secret manifest | client-side apply prunes keys other tooling created (see §6) |
| rebuild images "just in case" | `k8s.mjs up` detects them in containerd; a rebuild is ~4 minutes (build + save + import) |
| re-run `podman compose up` alongside the cluster | two copies of the same infra, ~1.9 GB each |
| hand-edit `.env.cluster` | regenerate it with `scripts/cluster-env.mjs`, or the next run silently reverts your edit |
| assume a pod is healthy because it is `Running` | the Secret-pruning bug produced exactly that: `Running` and unable to reach anything. Use `node scripts/k8s.mjs status`. |

## 9. Identity bootstrap — now fully in-cluster

Re-issuing identity mints new org / project / client IDs and invalidates every existing token, so it stays
a deliberate act. What changed is **where it runs**: it used to need a human on the host
(`kubectl port-forward` → `pnpm init:zitadel` → regenerate `.env.cluster` → apply the Secret), which made a
developer's `.env` the source of truth for cluster identity — a fresh clone could not reproduce the cluster.

```powershell
node scripts/k8s.mjs identity --yes    # provision in-cluster, patch the Secret, roll api + worker
node scripts/k8s.mjs pull              # sync host files (.env, wrangler.toml, oidc.json) from the Secret
```

`deploy/base/jobs/identity.yaml` does the work:

1. mounts the machine key from the `zitadel-keys` **PVC** (read-only) — written there by `start-from-init`
2. runs `scripts/init/zitadel-oidc.ts` with `ENV_FILE` pointed at a scratch file, so it never touches a
   repository checkout
3. runs `scripts/init/patch-secret.mjs`, which **merges** the four identity keys into `noname-env` through
   the Kubernetes API and rolls `api` + `worker`

No `kubectl` binary in the image, no host `cp`, no port-forward. RBAC is narrow
(`deploy/base/jobs/identity.yaml`): `get`/`patch` on that one Secret and on those two Deployments, nothing
cluster-wide.

Two details that matter:

- **A native sidecar** (`initContainers` + `restartPolicy: Always`) provides the loopback proxy, because
  `ZITADEL_ISSUER` is `http://localhost:8080` (the issuer baked into every token) and inside a pod
  `localhost` is the pod. Without it the Job cannot reach ZITADEL at all.
- **Merge patch, not apply.** Only the keys the Job owns are sent, so nothing else in the Secret is pruned
  — the exact failure recorded in §6 under "kubectl apply pruned the Secret".

Host files are **derived** now. `pull` is the only supported way to change them.

### Earlier option matrix (kept for context)

| Approach | Verdict |
|---|---|
| manual, four steps on the host | retired — every step was an error surface, and it tied cluster identity to one machine |
| one confirmed host command | what §9 replaced |
| **a bootstrap Job inside the cluster** | **implemented** — see above |