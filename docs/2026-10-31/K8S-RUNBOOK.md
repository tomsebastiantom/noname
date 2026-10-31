# Kubernetes runbook — start, check, recover

> **Date:** 2026-10-31 (America/New_York)
> **Scope:** the local k3s cluster that now runs the entire platform (infra + app + browser).
> **Companions:** [`K8S-MIGRATION-STATUS.md`](./K8S-MIGRATION-STATUS.md) (what has been moved and what is
> blocked) · [`LOCAL-K3S-CLUSTER.md`](./LOCAL-K3S-CLUSTER.md) (how the cluster itself was created) ·
> [`../2026-10-24/DEPLOYMENT-GUIDE.md`](../2026-10-24/DEPLOYMENT-GUIDE.md) (the compose path, still valid
> for OSS users).

---

## 1. The rule

**Run the script. Do not re-derive the steps by hand.**

```powershell
node scripts/k8s.mjs up        # bring everything up, idempotent
node scripts/k8s.mjs status    # read-only health summary, exit 0 only if all green
```

One CLI, four verbs: up, status, identity, seed (plus down). It is **Node, not PowerShell or bash**, so
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
  edge    manifest + Containerfile written, not applied yet
```

Manifests: `deploy/00-namespace.yaml`, `deploy/infra/*`, `deploy/app/*`, `deploy/browser/*`, `deploy/edge/*`.

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

## 7. Open gaps (reported by `node scripts/k8s.mjs status`)

| Gap | Why it is not done | Next action |
|---|---|---|
| **`seed data machine_definitions=0`** | seeding needs a valid identity, which needs `init:zitadel` to run against the **cluster** ZITADEL — that mints new org/client IDs, so it must be deliberate | `node scripts/k8s.mjs identity --yes` — does the whole sequence in order (§9) |
| `client` image | static rspack build → nginx | write `deploy/client/Containerfile` |
| `edge` not applied | needs its image built (`deploy/edge/Containerfile`) | build + apply, or accept it stays on the host |
| `eval-worker` | `packages/eval` has no worker entrypoint yet | implement the eval ladder (RFC-EVAL-SERVICE P1) |
| `NetworkPolicy` | k3s ships **Flannel**: accepts the object, enforces nothing | install Calico, or validate in a production-class cluster |

## 8. Session hygiene — what NOT to redo

| Do not | Why |
|---|---|
| re-run `pnpm init:zitadel` unless identity is meant to change | it mints **new** org/client IDs; `.env`, `wrangler.toml`, `oidc.json` and the cluster Secret all change, and existing tokens become invalid |
| `kubectl apply` any Secret manifest | client-side apply prunes keys other tooling created (see §6) |
| rebuild images "just in case" | `k8s.mjs up` detects them in containerd; a rebuild is ~4 minutes (build + save + import) |
| re-run `podman compose up` alongside the cluster | two copies of the same infra, ~1.9 GB each |
| hand-edit `.env.cluster` | regenerate it with `scripts/cluster-env.mjs`, or the next run silently reverts your edit |
| assume a pod is healthy because it is `Running` | the Secret-pruning bug produced exactly that: `Running` and unable to reach anything. Use `node scripts/k8s.mjs status`. |

## 9. Identity bootstrap — why it is one command and not a Job

Re-issuing identity mints **new** org / project / client IDs and invalidates every existing token. It
must therefore never happen as a side effect of "bringing things up". The options, and why the middle one
is what we do:

| Approach | Verdict |
|---|---|
| **Manual, four steps by hand** (port-forward → `init:zitadel` → regenerate Secret → seed) | the original plan; every step is a chance to get the order wrong, and step order is exactly what fails (`seed` before identity, Secret not regenerated) |
| **One confirmed command** — `node scripts/k8s.mjs identity --yes` | **what we do.** Keeps the deliberate signal (`-Yes`, exit 2 otherwise) and removes the ordering error surface. Port-forward is opened and closed by the script. |
| **A bootstrap Job inside the cluster** | the eventual shape, and it removes the last real weakness: `.env` on the host is currently the source of truth for cluster identity. Blocked on two things: `init:zitadel` writes host files (`ENV_FILE` override exists, but the output must become a **Secret patch**, which needs `kubectl` + RBAC inside the Job), and the machine key/PAT would have to be mounted as a Secret. Worth doing when identity churn becomes routine; not worth it before then. |

What the script enforces, in order:

1. `kubectl port-forward svc/zitadel 8080` (and it waits for `/.well-known/openid-configuration` to
   answer, rather than assuming it is up)
2. `pnpm init:zitadel` — re-issues identity, rewrites `.env`, `wrangler.toml`, `oidc.json`
3. `scripts/cluster-env.mjs` + Secret refresh — **the step people forget**, and the one whose absence
   produces a green pod that cannot reach anything
4. rollout restart of `api` + `worker`, so they pick up the new IDs
5. `seed` Job (`deploy/jobs/seed.yaml`), which drives the HTTP API and therefore needs 3–4 to have happened
6. `node scripts/k8s.mjs status`, which is where `seed data machine_definitions=2` finally turns green

`--skip-seed` initialises identity without seeding.