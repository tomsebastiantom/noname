# Deployment guide — run it without Kubernetes

> **Status:** current as of 2026-10-24 (America/New_York)
> **Companion:** [`RFC-DEPLOYMENT-TOPOLOGY.md`](./RFC-DEPLOYMENT-TOPOLOGY.md) explains *why* the two substrates exist. This page is *how to run them*.

---

## The short version

| You want | Use | Needs a browser? | Needs Kubernetes? |
|---|---|---|---|
| **Try the platform** | `docker compose up` (podman or docker) | **no** | no |
| **Develop a tenant/store** | compose + `pnpm dev` | no | no |
| **Verify a storefront** (tier 0/1) | `noname eval --tier 0,1` | **no** | no |
| **Verify rendering / a11y / checkout** (tier 2) | compose `--profile browser` | yes | no |
| **Run for real** | `deploy/` manifests | yes | yes |

**Compose is the easy path and it deliberately ships without the browser fleet.** Chromium is ~400 MB of image, needs `/dev/shm`, fonts and non-trivial memory — none of which belongs in a first-run experience. People should be able to see the platform working in one command.

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
# 1. infrastructure: postgres, redis (dragonfly), clickhouse, s3, zitadel, keto, vault, nango, jaeger
podman compose -f docker-compose.yml up -d

# 2. schema — migrations are the only correct path now
pnpm --filter @noname/server db:migrate

# 3. three app processes (separate terminals, or the noname-dev skill)
pnpm --filter @noname/server dev      # API   :3000
pnpm --filter @noname/workers dev     # edge  :8787
pnpm --filter @noname/client dev      # client:5173

# 4. data + machine definitions
pnpm seed:demo:full

# 5. prove it
curl -sf localhost:3000/health && curl -sf localhost:3000/ready && echo ok
```

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
