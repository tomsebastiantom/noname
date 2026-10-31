# Deployment guide — run it without Kubernetes

> **Status:** current as of 2026-10-24 (America/New_York)
> **Companion:** [`RFC-DEPLOYMENT-TOPOLOGY.md`](./RFC-DEPLOYMENT-TOPOLOGY.md) explains *why* the two substrates exist. This page is *how to run them*.

---

## The short version

There are **two developer tracks** and **one production shape**:

| You want | Track | Needs KUbernetes? | Needs a browser? |
|---|---|---|---|
| **Try it / normal development** | **A — compose** (default) | no | no |
| **Debug app-level deployment** (pod shapes, probes, limits, CDP) | **B1 — app in local cluster** (`podman kube play`) | locally, app only | no |
| **Verify rendering / a11y / checkout** | compose `--profile browser` | no | yes |
| **Run for real** | one cluster, whole workload | yes | yes |

Track A is one command and stays that way. Track B exists for people who need to see the manifests actually run; it uses the same images and the same env contract, and it is **not** a second system.

**B1 is app parity, not deployment parity.** With infrastructure outside the cluster it cannot validate StatefulSets, PVCs, secret injection, or compose-vs-cluster DNS. Full parity (**B2**: infra + app + browser inside Kubernetes) needs a 12 GiB+ VM, which this host cannot provide — so B2 is the target, B1 is what a laptop can rehearse.

Production is **all in or stay out**: every service in the cluster, or none. A cluster holding only the browser pays the full control-plane cost and then makes the browser reach the API across a boundary — the exact glue that breaks in production. (Locally, `podman kube play` of the app services against compose infrastructure is fine — that is a dev convenience, not a production shape.)

**Compose deliberately ships without the browser fleet.** Chromium is ~400 MB of image, needs `/dev/shm`, fonts and real memory — none of which belongs in a first-run experience. People should see the platform working in one command.

---

## 1. Local machine sizing (read this first)

**Podman WSL machines cannot be resized.** `podman machine set --memory` fails with *"changing CPUs not supported for WSL machines"*, so capacity must be chosen at creation:

```bash
# dev only (compose, no browser): 4 GB is enough
podman machine init noname --cpus 4 --memory 4096 --disk-size 100

# dev + browser profile, or a local cluster: 6 GB+
podman machine init noname --cpus 6 --memory 6144 --disk-size 120

podman machine start noname
podman system connection default noname     # rootless; do not use `-root`
```

Verify you are on the rootless connection — after removing a machine, podman can silently switch the default to `<name>-root`, which changes volume ownership and breaks the stack:

```bash
podman system connection list --format '{{.Name}} {{.Default}}'
```

Measured on the development machine (2026-10-24): host 15.7 GB total, ~5 GB free → **one VM, not two**. A 6 GiB WSL VM plus the host is already the practical ceiling.

## 2. Path A — local dev, no browser (the default)

```bash
# 0. FIRST RUN ON A FRESH VM ONLY — identity must exist before anything reads it
pnpm init:zitadel      # provisions org/project/OIDC app, writes root .env + wrangler.toml

# 1. infrastructure: postgres, redis (dragonfly), clickhouse, s3, zitadel, keto, vault, nango, jaeger
podman compose -f docker-compose.yml up -d

# 2. schema — migrations are the only correct path now
pnpm --filter @noname/server db:migrate

# 3. three app processes (separate terminals, or the noname-dev skill)
#    NOTE: start these AFTER init:zitadel — the API reads the root .env at process start
pnpm --filter @noname/server dev      # API   :3000
pnpm --filter @noname/workers dev     # edge  :8787
pnpm --filter @noname/client dev      # client:5173

# 4. data + machine definitions
pnpm seed:demo:full

# 5. prove it
curl -sf localhost:3000/health && curl -sf localhost:3000/ready && echo ok
```

**The order is not cosmetic.** Measured on a fresh VM (2026-10-24): running the seed before `init:zitadel`, or starting the API before it, fails with

```
ZITADEL management token failed: invalid assertion
```

because a fresh ZITADEL instance generates its own keys while the repository still holds the *previous* instance's IDs. `init:zitadel` rewrites the root `.env` (`ZITADEL_DEMO_ORG_ID`, `ZITADEL_CLIENT_ID`, `ZITADEL_PROJECT_ID`) and `wrangler.toml`, and `packages/server/src/load-env.ts` deliberately loads the **root** `.env` first — so the API must be (re)started *after* provisioning, not merely have its files updated.

Expect new IDs each time the VM is recreated; the old ones are worthless. After the restart, `seed:demo:full` completes and verifies both machine definitions (`cart`, `inventory_reservation`).

Then open `http://yogastore.localhost:5173` (Chrome resolves `*.localhost` to loopback; no hosts file needed).

**What works in this mode:** everything — content, layouts, pages, admin, editor, commerce flows, flags, analytics, retention, and eval **tiers 0 and 1** (manifest and route checks, which need no browser at all).

**What does not:** eval **tier 2** (render/overflow, a11y, checkout click-through) and tenant extension bundles. Those need a real browser.

## 3. Path B — add the browser fleet (opt-in profile)

The browser services are a **compose profile**, never the default:

```bash
podman compose -f docker-compose.yml --profile browser up -d
```

That adds two containers and nothing else:

| Service | Why |
|---|---|
| `eval-browser` | Chromium exposing CDP + `/pressure`, `CONCURRENT`, `QUEUED`, `TIMEOUT`. Requires `--shm-size=2g` and font packages mounted |
| `eval-worker` | drains the `eval` queue and connects over CDP (`connectOverCDP`) |

Verify the contract before running any checks:

```bash
curl -sf localhost:3001/pressure      # pool says whether it can take work
```

Without this profile, `noname eval --tier 2` should **skip with a clear message** ("browser pool unavailable"), never silently pass — a skipped check is not a passed check.

## 4. Path C — production (Kubernetes)

> **⚠️ Check your context before every apply.** This development machine has three kubeconfig contexts, and the **default is a real AKS cluster**:
>
> | Context | Server | What it is |
> |---|---|---|
> | `operations` **(current)** | `*.hcp.eastus.azmk8s.io` | a real AKS cluster — **not ours** |
> | `do-tor1-nexa` | `*.k8s.ondigitalocean.com` | a real DigitalOcean cluster — **not ours** |
> | `docker-desktop` | `kubernetes.docker.internal:6443` | a local cluster (may not be running) |
>
> A bare `kubectl apply -f …` goes to whichever context is current. Always pass it explicitly:
>
> ```bash
> kubectl --context docker-desktop apply -k deploy/     # local, safe
> kubectl --context <the-intended-cluster> apply -k deploy/
> ```

```bash
kubectl apply -k deploy/          # browser pool, eval worker, policies
```

What exists only here, and cannot be faked locally:

- **`NetworkPolicy`** — "this pod reaches the tenant edge and its CDN, nothing else". Enforced by the CNI (Calico/Cilium), not by the app.
- **KEDA scaling** on queue depth with a warm floor.
- **PDB** so a rollout never takes the pool to zero.

See the RFC for the manifest inventory. `podman kube play deploy/browser/*.yaml` validates the *pod shape* locally (shared netns, limits, probes, CDP) without a control plane.

## 5. Troubleshooting the things that actually go wrong

| Symptom | Cause |
|---|---|
| `changing CPUs not supported for WSL machines` | WSL VMs are fixed-size; create a new machine with the size you need |
| Volumes look empty / permission errors after machine surgery | the default connection flipped to `<name>-root`. Set it back to the rootless `noname` |
| Chrome crashes under load, only in a container | `/dev/shm` is 64 MB by default → run with `--shm-size=2g` |
| Layouts look different locally vs the browser pool | fonts are not installed in the browser image; missing fonts change text metrics and produce phantom overflow failures |
| `eval --tier 2` reports `skip` | the browser profile is not running — by design, not a failure |
| API says `400 org id required` while everything looks "up" | the VM stopped and dependencies are unreachable; check `podman machine list` before debugging code |

## 6. What "easy without Kubernetes" costs us

Being explicit, because it is a real trade:

- **No isolation locally.** Untrusted tenant extension code would run in your browser context. Locally we accept that; production does not.
- **No scaling behaviour.** Queue back-off logic is exercised, KEDA decisions are not.
- **One browser, no pool.** Concurrency is 1–4; the nightly sweep is the only place that matters, and it is not something an OSS user runs.

Which is why the eval contract (`/pressure`, bounded queue, per-session timeout) is implemented in the *caller* as well as the pool: on compose the caller is the only protection, and on Kubernetes it is the first line before the CNI.
