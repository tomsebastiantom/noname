# Environments and promotion

> **Status:** decision · **Date:** 2026-10-31 (America/New_York)
> **Question:** how do local development, staging and production relate; what runs where; what is exposed where;
> and how do manifests get promoted without local shortcuts leaking into production?
> **Related:** [`K8S-RUNBOOK.md`](./K8S-RUNBOOK.md) (running the local cluster) · [`EDGE.md`](./EDGE.md) (the edge
> is the only workload outside the cluster) · [`../2026-10-24/DEPLOYMENT-GUIDE.md`](../2026-10-24/DEPLOYMENT-GUIDE.md) (compose)

---

## 1. The environment matrix

| | **Local — cluster infra** (this developer) | **Local — compose** (other contributors) | **Staging** | **Production** |
|---|---|---|---|---|
| **Infra** (postgres, redis, clickhouse, s3, vault, keto, nango, zitadel, jaeger) | **k8s** | **compose** | k8s | k8s |
| **Browser fleet** | **k8s** | one container (or none) | k8s + autoscaling | k8s + autoscaling |
| **Services** (api, worker) | **`pnpm dev` in a terminal** — unchanged | `pnpm dev` — unchanged | k8s (images) | k8s (images) |
| **Client** | rspack dev server | rspack dev server | k8s (nginx) | k8s (nginx) |
| **Edge** | `wrangler dev` | `wrangler dev` | **Cloudflare** | **Cloudflare** |
| **Why** | fleet + real topology, fast service iteration | zero-setup, no cluster | pre-prod verification | users |

Two local modes, one difference: **where the infra lives**. Services, client and edge are identical in both —
`pnpm dev` / `wrangler dev`, exactly as today. Compose is not deprecated; it stays as the documented path for
contributors who do not want a cluster, and as the fallback when the cluster is down.

## 2. The trade-off this table encodes

| | infra in compose | infra in k8s |
|---|---|---|
| start the stack | one command, seconds | cluster must be running |
| state reset | `compose down -v` | delete the PVCs |
| browser fleet | one browser at best | **N browsers, isolated, autoscaled** |
| parity with staging/prod | low (different topology) | high (same manifests) |
| cost to reach infra | zero | **port-forwards** (see §3) |

The cluster exists here for **two reasons only**: the browser fleet, and proving that the manifests work. It is
not there to make service development faster — it makes it slower, which is why services stay on the host.

## 3. Reaching the cluster's infra from the host

Services on the host must talk to infra in the cluster. There is no NodePort in this design (it binds every
node's IP and bypasses Ingress/TLS/policy), so access is explicit:

```bash
kubectl -n noname port-forward svc/postgres     5432:5432
kubectl -n noname port-forward svc/dragonfly    6379:6379
kubectl -n noname port-forward svc/clickhouse   8123:8123
kubectl -n noname port-forward svc/s3           9000:9000
kubectl -n noname port-forward svc/vault        8200:8200
kubectl -n noname port-forward svc/keto         4466:4466
kubectl -n noname port-forward svc/zitadel      8080:8080
kubectl -n noname port-forward svc/nango        3003:3003
kubectl -n noname port-forward svc/jaeger       4318:4318
```

`.env` then keeps **exactly the values it has today** (`localhost:5432`, `localhost:8080`, …) — nothing to
rewrite, because port-forwarding makes the cluster look like a local server. That is the whole reason to prefer
it over inventing node IPs.

Behaviour to know: a forward dies with its terminal, and a dropped `zitadel` forward shows up as
`invalid assertion` (identity is unreachable), not as a network error. Start them in one terminal and leave it.

## 4. The compose environment (for contributors)

`docker-compose.yml` provides the same nine services, so the repo works without k3s:

| Service | Host port(s) |
|---|---|
| postgres | 5432 |
| dragonfly (redis) | 6379 |
| clickhouse | 8123, and 9001 → container 9000 |
| keto | 4466 (read), 4467 (write), 4468 (metrics) |
| zitadel | 8080 |
| s3 (s3rver) | 9000 |
| jaeger | 16686 (UI), 4318 (OTLP) |
| vault | 8200 |
| nango | 3003 (server), 3009 (connect UI) |

One-shot helpers: `postgres-init-dbs` (creates the `zitadel`, `nango`, `keto` databases and extensions) and
`s3-init` (creates the `noname-assets` bucket). Volumes: `postgres_data`, `clickhouse_data`, `zitadel_keys`.

```bash
podman compose up -d          # or: docker compose up -d
pnpm init:zitadel             # identity, once
pnpm db:migrate && pnpm seed:demo:full
pnpm dev                      # services on the host, pointing at localhost
```

Compose and the cluster are **alternatives, not layers**: running both means two copies of nine services
(~1.9 GB each). Pick one per session.

## 5. Why `base` + `overlays` (kustomize)

The pattern the Kubernetes ecosystem converged on, built into `kubectl` itself (`kubectl apply -k`):

- **kustomize** — `base/` is the environment-neutral shape; `overlays/<env>/` holds only the delta. This is what
  operators and add-ons do (kube-prometheus ships `kustomize build`), and what Argo CD and Flux recommend for
  environment promotion.
- **Helm** — the alternative, and the right choice when you must *package* for third parties (charts, values
  files, versioned releases). We do not distribute this to external users yet, so its machinery buys nothing.

The property that matters: **a local-only setting cannot reach production**, because it lives in
`overlays/local` and `base/` does not contain it. Today everything is one flat set (`deploy/infra`, `deploy/app`,
`deploy/jobs`, `deploy/browser`, `deploy/client`) with dev values inline — one careless
`kubectl apply -f deploy/` from a production cluster away from an incident.

```
deploy/
  base/                      # ClusterIP only; no dev values, no TLS, no NodePort
    infra/*.yaml  app/*.yaml  jobs/*.yaml  browser/deployment.yaml
    kustomization.yaml
  overlays/
    local/                   # infra + browser only (services run on the host); 1 replica, local-path storage
    staging/                 # + api/worker/client, TLS ingress, 2 replicas, managed storage
    prod/                    # + HPA, PDB, 3 replicas, backups, NetworkPolicy
```

Apply: `kubectl apply -k deploy/overlays/local` — never `kubectl apply -f deploy/`.

## 6. What differs per environment

| Concern | local | staging | prod |
|---|---|---|---|
| which workloads | infra + browser | + api, worker, client | same |
| image reference | `localhost/noname-*:dev`, `IfNotPresent` | registry + git SHA tag | registry + **digest** |
| replicas | 1 | 2 | 3 + HPA |
| storage class | `local-path` | managed block storage | managed + snapshots |
| secrets | dev values inline today → `secretRef` | external secret manager | external secret manager |
| ingress | none (port-forward) | one hostname + TLS | hostnames + TLS + WAF |
| NetworkPolicy | not enforced (Flannel) | required | required |
| `ZITADEL_ISSUER` | `http://localhost:8080` | `https://auth.staging.…` | `https://auth.…` |

The last row is why identity is **per environment**: each issues its own org/client IDs, so tokens are not
portable between them (`node scripts/k8s.mjs identity --yes` bootstraps each).

## 7. Promotion path

```
change code
  ↓  pnpm check                      (tests, typecheck, biome)
pnpm dev + compose infra             ← iterate: seconds
  ↓  build the image, tag with the git SHA
kubectl apply -k overlays/local      ← local parity: same infra manifests, fleet available
  ↓  push to a registry (missing today)
overlays/staging + Cloudflare staging worker
  ↓  eval ladder + smoke
overlays/prod + prod worker          ← promote the same digest
```

**Promote the artifact, never rebuild it.** The digest that passed staging is the digest that runs in prod.

## 8. What is missing before staging/prod are real

| # | Gap | Consequence |
|---|---|---|
| 1 | container registry | images move by `podman save` → `k3s ctr import`, which only works on one machine |
| 2 | Ingress + TLS | no public entry point; the edge has no origin to reach |
| 3 | external secrets | `noname_dev`, `dev-root-token`, the ZITADEL masterkey are in the manifests |
| 4 | managed storage + backups | `local-path` PVCs are single-node, with no restore story |
| 5 | NetworkPolicy enforcement | Flannel accepts the object and enforces nothing (needs Calico/Cilium) |
| 6 | base/overlays split (§5) | dev values sit one `apply` away from production |
| 7 | eval worker | the fleet is healthy but **idle** — nothing drives it, so its value is unproven |

## 9. Decision log (this session)

| Decision | Why | Status |
|---|---|---|
| Cluster is **k3s in WSL**, not minikube | minikube needs rootful podman on WSL and would re-own the existing volumes | done |
| **No NodePort**; port-forward locally, Ingress in staging/prod | NodePort binds every node's IP and bypasses Ingress/TLS/policy | decided |
| **Edge never runs in the cluster** | it is a Worker: `wrangler dev` locally, Cloudflare in prod; in-cluster it needed a socat sidecar, a `--var` override and a seeded R2 bucket to work at all | done (`deploy/edge/` deleted) |
| **Services stay on the host** (`pnpm dev`) | k8s makes iteration 3–5 minutes per change; the cluster is for the fleet and for parity, not for speed | decided |
| **Browser fleet lives in k8s** | cgroups isolation per browser, `/dev/shm` sizing, `/pressure` autoscaling — none of which compose can do | deployed, **idle until eval exists** |
| **Compose stays** as a first-class path | contributors without a cluster; also the fallback when the cluster is down | documented (§4) |
| **kustomize base + overlays**, not Helm | built into `kubectl`, no packaging requirement, and the property that local settings cannot leak into prod | **pending** (§5) |
| **Identity is per environment**, bootstrapped by an in-cluster Job | `init:zitadel` mints IDs and invalidates tokens; the host `.env` must stop being the source of truth | done (`deploy/jobs/identity.yaml`) |
| **Promote digests, never rebuild** | a rebuild silently changes the artifact that was verified | policy (§7) |
