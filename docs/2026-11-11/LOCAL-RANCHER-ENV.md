# Local environment — Rancher Desktop + host app (2026-11-11)

> **Status:** **current local setup.** Replaces the WSL-k3s cluster described in
> [`../2026-10-31/LOCAL-K3S-CLUSTER.md`](../2026-10-31/LOCAL-K3S-CLUSTER.md) and
> [`../2026-10-31/K8S-RUNBOOK.md`](../2026-10-31/K8S-RUNBOOK.md) for this machine.
> **Shape:** infra in Kubernetes (Rancher Desktop), app on the host (`pnpm dev`).

---

## 1. Why Rancher replaced WSL k3s

k3s in the Ubuntu WSL distro died whenever the distro stopped: `172.29.7.40:6443` refused, every NodePort
refused, pods went `Error`. Keeping it alive needed a scheduled task whose only job was `sleep infinity`.

Rancher Desktop owns its own WSL distro (`rancher-desktop`), starts with Windows, and bundles k3s. It needed no
supervision after that.

**Caveat that decided the architecture:** this machine is **Windows 10 21H2 (build 19044)**. WSL
`networkingMode=mirrored` — the setting that would share localhost between Windows and WSL — requires
**Windows 11 22H2+**, so it is unavailable. Rancher also does not publish NodePorts to the Windows host; only
80/443 are forwarded. That is why the app reaches the cluster through port-forwards, not NodePorts.

## 2. What runs where

| Layer | Where |
|---|---|
| postgres, redis (dragonfly), clickhouse, vault, keto, s3, zitadel, jaeger, nango | Rancher cluster, namespace `noname` |
| api, worker, client, browser | **host** — `pnpm --filter @noname/{server,workers,client} dev` |
| the same four as Deployments | scaled to **0** in the cluster (parity manifests only) |

```powershell
kubectl -n noname scale deploy api worker client browser --replicas=0
```

`pnpm rancher up` does this automatically after applying the overlay.

## 3. Ports — owned by Rancher Desktop, not by a script

Port forwards live in **Rancher Desktop → Port Forwarding**, using the fixed local ports below. Rancher
persists them and re-creates them on every start.

```powershell
pnpm rancher up        # apply infra overlay, scale app deployments to 0, migrate
pnpm rancher env       # rewrite .env to the fixed local ports
pnpm rancher status    # cluster + reachability; exits 1 if a forward is missing
```

| Service | Port name | Set Local Port to | Cluster |
|---|---|---|---|
| postgres | `postgres` | **25432** | svc/postgres:5432 |
| dragonfly | `redis` | **16379** | svc/dragonfly:6379 |
| clickhouse | `http` | **18123** | svc/clickhouse:8123 |
| vault | `http` | **18200** | svc/vault:8200 |
| keto | `read` | **14466** | svc/keto:4466 |
| keto | `write` | **14467** | svc/keto:4467 |
| s3 | `http` | **19000** | svc/s3:9000 |
| zitadel | `http` | **8080** | svc/zitadel:8080 |

Do **not** forward `keto metrics`, `clickhouse native`, `nango`, `jaeger`, `api`, `client` or `browser`:
Jaeger and Nango are served by Traefik, ClickHouse is used over HTTP, and the three app deployments run on the
host at 0 replicas.

> **Why not a script.** `kubectl port-forward` started from a shell dies with that shell — from an agent or a
> closed terminal the stack then looks broken at random. A scheduled task fixed it but created a second
> mechanism for the same job. Rancher owns the cluster, so Rancher owns the forwards.

Browser UIs do **not** need a forward — they go through Traefik on host port 80
(`deploy/overlays/local/ingress.yaml`):

```
http://jaeger.localhost
http://nango.localhost
```

## 4. Gotchas — each one actually cost time

> 1. **`packages/server/.env` is the R2/S3 config and it is gitignored.**
>    It holds `R2_ENDPOINT`, `R2_PUBLIC_URL`, `R2_BUCKET`, keys. If the cluster changes (new VM, new forward
>    port, rebuilt cluster), that file still points at the **old** address and every asset upload fails with a
>    bare `500` — which surfaces as `Upload google.svg → 500` midway through `pnpm seed:demo:full`.
>    Repoint it whenever `pnpm rancher env` changes ports.
>
> 2. **`ZITADEL_ISSUER` must be `http://localhost:8080`, not `127.0.0.1`.**
>    Zitadel's `ZITADEL_EXTERNALDOMAIN` is `localhost`. Requesting through `127.0.0.1` returns
>    `Errors.Instance.NotFound` and `/.well-known/openid-configuration` 404s.
>
> 3. **A stale `zitadel_keys/login-client.pat` breaks seed login after re-initialising Zitadel.**
>    `init:zitadel` skips PAT creation when the file exists, so the seed logs in with a PAT from the previous
>    instance and gets `Errors.Token.Invalid (AUTH-7fs1e)`. Delete the file and re-run `pnpm init:zitadel`.
>
> 4. **The API must be restarted after `pnpm init:zitadel`.**
>    `ZITADEL_CLIENT_ID`, `ZITADEL_PROJECT_ID` and `ZITADEL_DEMO_ORG_ID` are read at boot; a running server
>    keeps the old ones and returns 401 for fresh tokens.
>
> 5. **Only one infra stack at a time.** Podman compose and the Rancher cluster both bind 5432/6379/8123/8200.
>    Today Podman is fully stopped (no machine, no containers, no processes) and the compose machine was
>    removed to free disk. Do not start compose “just for a test” while running against the cluster — you would
>    get two databases and confusing login/data failures.
>
> 6. **The visual editor is a lazy chunk.** `?edit=true` shows `Loading editor…` for ~5–10 s on a cold load. A
>    short smoke test reports an empty page; wait for blocks before judging.
>
> 7. **Login inputs have no `name` attribute.** Use `input[type="email"]` / `input[type="password"]`; selectors
>    like `input[name="email"]` never match.
>
> 8. **`/admin/agents` is not a route.** The page is `/admin/settings/agents`
>    (`packages/client/src/platform-routes.ts`); unknown `/admin/*` falls back to `AdminHome`.

## 5. First-run bring-up

```powershell
# 1. cluster + infra (+ migrations, .env)
#    one-time: add the 8 Port Forwarding rows in Rancher Desktop (§3)
pnpm rancher up

# 2. identity — only when the cluster is new or Zitadel was reset
#    (machine key lives on the zitadel-keys PVC; copy it out first)
$env:ZITADEL_ISSUER='http://localhost:8080'
$env:ZITADEL_MACHINE_KEY_PATH='zitadel_keys/noname-backend-sa.json'
pnpm init:zitadel

# 3. app
pnpm --filter @noname/server dev
pnpm --filter @noname/client dev

# 4. demo data
pnpm seed:demo:full
```

Checks that must pass:

```powershell
curl.exe http://localhost:3000/health                          # 200
curl.exe http://localhost:8080/.well-known/openid-configuration # 200
curl.exe -H "Host: jaeger.localhost" http://127.0.0.1/          # 200 (Traefik)
```

## 6. Testing — reuse, do not rebuild

Prefer the existing entry points over ad-hoc scripts:

| Need | Command |
|---|---|
| Unit / integration | `pnpm test` (vitest, whole repo) |
| One package | `pnpm vitest run packages/server/src/domains/<x>` |
| Typecheck | `pnpm --filter @noname/<pkg> typecheck` |
| Browser + API smoke | the `noname-test` skill |
| Cluster health | `pnpm rancher status` (exits 1 if a Port Forwarding row is missing) |

The `.tools/*.mjs` browser scripts used while verifying this setup (`inspect-pages`, `verify-login`,
`probe-editor`, `verify-pages`) are **gitignored diagnostics**, not a test suite. They duplicate what the
`noname-test` skill already does; do not grow them into a second harness.

## 7. Verified state (2026-11-11)

| Check | Result |
|---|---|
| Cluster | Rancher, k3s v1.37.2, node `Ready` |
| Infra pods | postgres, redis, clickhouse, vault, keto, s3, zitadel, jaeger, nango — all `Running` |
| App deployments | `api/client/worker/browser` `0/0` |
| Migrations | 8/8 on the cluster Postgres |
| Identity | org `398655937176469540`, project `399159787020877870` |
| Seed | `pnpm seed:demo:full` → `completed full/commerce` |
| Browser | storefront, login, admin, orders, agents, editor, product — all render, no console errors |
| Podman | stopped (no machine, no containers, no processes) |

Details and screenshots: [`BROWSER-VERIFICATION.md`](./BROWSER-VERIFICATION.md).
