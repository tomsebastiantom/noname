# Local Kubernetes + the browser fleet — tooling survey and recipe

> **Date:** 2026-10-31 (America/New_York)
> **Purpose:** pick a local cluster for manifest work, and get the eval browser running inside it so tier‑2 checks can be exercised locally.
> **Context:** [`RFC-DEPLOYMENT-TOPOLOGY.md`](../2026-10-24/RFC-DEPLOYMENT-TOPOLOGY.md) §5 (B1/B2), [`RFC-EVAL-SERVICE.md`](../2026-10-24/RFC-EVAL-SERVICE.md) §5 (browser runtime).

---

## 1. What is actually available on this machine (verified)

| Thing | State |
|---|---|
| podman machine `noname` | running, **rootless**, WSL, 7.8 GB visible, ~5.9 GB free |
| compose stack | 9 infra services, ~1.9 GB used |
| `kubectl`, `helm`, `kompose` | installed |
| `minikube`, `kind`, `k3d`, `k3s` | **not installed** |
| `docker-desktop` context | configured, but **server unreachable** (`127.0.0.1:6443` refused) → Docker Desktop k8s is not running |
| `operations` context (AKS) | configured, **host does not resolve** from here |
| `do-tor1-nexa` (DigitalOcean) | configured, not tested — treat as off-limits |

## 2. The options, honestly compared — **engine-agnostic**

The platform has **no container-engine dependency**: services reach Postgres/Redis/etc. over ordinary network URLs. An engine is needed only to *start local infrastructure* and to *build images*, and **either podman or docker is acceptable**. podman is the development default; docker is supported, not required, and not excluded.

The nuance worth internalising: several local-Kubernetes tools are built on a **Docker API**, not on Docker the product. podman can serve that API (`podman system service`), so those tools work — but through a shim, which matters when something breaks.

| Tool | Container API needed | Real API server? | Control-plane cost |
|---|---|---|---|
| **`podman kube play`** | native podman | ❌ | **0** |
| **k3s in its own WSL distro** | none — embeds containerd | ✅ | ~0.5–1 GB |
| **minikube `--driver=podman`** | native podman driver | ✅ | ~1–1.5 GB |
| **k3d** | **Docker API** → `podman system service` works | ✅ | ~0.7–1.2 GB |
| **kind** | **Docker API** → `KIND_EXPERIMENTAL_PROVIDER=podman` works | ✅ | ~1–1.5 GB |
| **Docker Desktop k8s** | Docker | ✅ | ~2 GB |

**Recommendation order** — cheapest and fewest moving parts first:

1. **`podman kube play deploy/`** — no control plane, no Docker API; validates pod shape, probes, limits, CDP hop.
2. **k3s in a separate WSL distro** — real API server, embeds containerd, touches neither podman nor docker.
3. **minikube `--driver=podman`** — native podman; rootful caveat below.
4. **k3d / kind** — only if 1–3 are ruled out; both put a Docker-API shim in the failure path.
5. **Docker Desktop** — supported like any Docker path, but it is a second VM competing for the same RAM.

### What is genuinely engine-specific (document once, not twice)

| Concern | podman | docker |
|---|---|---|
| Compose | `podman compose` (podman-compose or the docker-compose provider) | `docker compose` (v2 plugin) |
| SELinux bind mounts | may need `:z` / `:Z` | ignored |
| Rootless ports < 1024 | user namespaces / port config | similar caveats |
| Machine/VM | `podman machine` (WSL on Windows) | Docker Desktop or WSL backend |
| Image build | `podman build` — reads `Dockerfile` **or** `Containerfile` | `docker build` — same files |

Agnostic in practice means: **one `docker-compose.yml`** (both engines read it), **one `Containerfile`** (both build it), and the CLI **detects which engine exists** instead of assuming one.

### The minikube trap worth knowing

minikube is the obvious choice and it is the one that **cannot** be used here without changing the machine that holds your data: on WSL it requires a **rootful** podman machine ([Podman Desktop doc](https://github.com/podman-desktop/podman-desktop/blob/main/website/docs/minikube/configuring-podman-for-minikube-on-windows.md): *"With a Podman machine running on WSL, Minikube requires a rootful machine"*), and `podman machine set --rootful` re-owns existing volumes. Do that only on a **fresh** machine, never on `noname` while the stack lives there.

## 3. Browser in the cluster — the recipe

```yaml
# deploy/browser/deployment.yaml (essentials)
spec:
  replicas: 1
  template:
    spec:
      automountServiceAccountToken: false        # a page must not be able to read a token
      securityContext: { runAsNonRoot: true }
      containers:
        - name: chromium
          image: mcr.microsoft.com/playwright:v1.63.0-noble   # browsers + deps baked in
          command: ["npx", "playwright", "run-server", "--port", "3000", "--host", "0.0.0.0"]
          ports: [{ containerPort: 3000 }]
          resources:
            requests: { cpu: "500m", memory: "512Mi" }
            limits:   { cpu: "2",    memory: "2Gi" }
          volumeMounts:
            - { name: shm, mountPath: /dev/shm }
          readinessProbe:
            tcpSocket: { port: 3000 }
            periodSeconds: 5
      volumes:
        - name: shm
          emptyDir: { medium: Memory, sizeLimit: 2Gi }   # the k8s form of --shm-size=2g
```

Three things that decide whether this works:

- **`/dev/shm` as a memory-backed `emptyDir`.** The default 64 MB is what makes Chromium crash under load; `--shm-size` has no meaning in Kubernetes, the volume is the equivalent.
- **Fonts are in the image** (`playwright:v1.63.0-noble` ships them). A slim base image without fonts produces *phantom* overflow failures — real-looking bugs that do not exist.
- **No service-account token and no credentials in the context.** The browser executes tenant-controlled content; `automountServiceAccountToken: false` is the cheapest possible hardening.

### Wiring eval to it

```bash
# eval worker (in or out of the cluster)
EVAL_CDP_ENDPOINT=ws://browser:3000/          # in-cluster DNS
# or from the host during kube play / port-forward:
EVAL_CDP_ENDPOINT=ws://127.0.0.1:3000/
```

Tier 0/1 (`M4`, `M5`, `R1`, `R2`) already work without any of this. The browser unlocks **tier 2**: render at 375/768/1440 and assert `scrollWidth <= clientWidth`, a11y labels, and key content.

## 4. What a local cluster still cannot prove

| Claim | Why it stays unproven locally |
|---|---|
| "Egress is blocked" | `NetworkPolicy` needs a CNI that enforces it (Calico/Cilium); the common local setups do not |
| KEDA scaling decisions | needs a working autoscaler and load; not reproducible on a laptop |
| PDB behaviour under drain | needs multiple nodes |
| Production secret injection | local Secrets are not a Vault/CSI path |

So a local cluster buys **manifest correctness and the browser loop**, not production behaviour. That is still the majority of what breaks at cutover.

## 5. Next steps

1. Write `deploy/browser/{deployment,service}.yaml` from the recipe above.
2. `podman kube play deploy/browser/` → confirm the pod starts, `/dev/shm` is 2 GiB inside it, and CDP answers.
3. Add `EVAL_CDP_ENDPOINT` support + a single `B2.overflow` check at 375px against `/`.
4. Prove it: force an oversized element, watch the check fail, remove it, watch it pass.
5. Only then consider a real API server (k3s distro / k3d) for Jobs and probes.
