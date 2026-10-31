# Local Kubernetes cluster (k3s in WSL) — how to use it

> **Date:** 2026-10-31 (America/New_York)
> **Status:** **running.** Verified end-to-end: pod scheduled, ran, logged, cleaned up.
> **Why k3s here:** podman's WSL machine is **rootless**, and minikube requires a *rootful* machine on WSL — changing that would re-own the volumes holding the running stack. k3s runs in the existing **Ubuntu** WSL distro instead, touching podman not at all.

---

## What is running

| | |
|---|---|
| Runtime | **k3s v1.36.5+k3s1**, server + agent in the Ubuntu distro, `systemd` unit `k3s` |
| Node | `desktop-fp1h8cu`, `Ready`, control-plane |
| Container runtime | containerd (embedded) |
| Traefik / ServiceLB | disabled (`--disable traefik --disable servicelb`) to save resources |
| Namespace | `noname` (created) |
| kubeconfig | `C:\Users\<you>\.kube\k3s.yaml` — **kept separate** from the AKS/DO contexts on purpose |
| Memory | WSL pool 7.8 GB total, ~2.2 GB used with k3s + compose running |

## Use it

```powershell
$env:KUBECONFIG = "$env:USERPROFILE\.kube\k3s.yaml"
kubectl get nodes
kubectl -n noname get all
```

The kubeconfig's server is the **WSL IP** (`https://172.29.7.40:6443`), not `127.0.0.1` — see the gotcha below.

## The gotcha that cost 20 minutes

**WSL2 shuts the distro down when no process is inside it**, which kills the API server's `localhost` forwarding and looks exactly like a network fault:

```
first kubectl call  → works
second call         → dial tcp 172.29.7.40:6443: connection refused
```

Two fixes, both applied here:

1. **Hold the distro open** with a detached process:
   ```powershell
   Start-Process wsl.exe -ArgumentList '-d','Ubuntu','-u','root','--','sleep','infinity' -WindowStyle Hidden
   ```
   A PowerShell background job is **not** enough — it dies with the job.
2. **Point the kubeconfig at the WSL IP** rather than `127.0.0.1`, so it keeps working when forwarding is flaky.

If the cluster dies after a reboot: start the keep-alive, wait ~20 s, then `kubectl get nodes`.

## What this cluster is good for

| Works | Does not work |
|---|---|
| Applying real manifests, probes, limits, Jobs | Enforced `NetworkPolicy` — k3s ships **Flannel**, which accepts the object and enforces nothing |
| Scheduling the browser pod, CDP over a Service/port-forward | IAM / pod identity (no cloud equivalent) |
| `kubectl` from Windows, logs, events, exec | Load balancers, TLS ingress, durable storage |

For policy enforcement later: install Calico (`kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/master/manifests/calico.yaml`) after disabling Flannel, or use `minikube --cni=calico` on a rootful machine.

## Next step

`deploy/browser/{deployment,service}.yaml` → `kubectl -n noname apply -f deploy/browser/` → confirm the pod serves CDP and `/dev/shm` is 2 GiB inside it:

```powershell
kubectl -n noname exec deploy/browser -- df -h /dev/shm
```

Then `EVAL_CDP_ENDPOINT=ws://<node-ip>:3000/` wires the eval worker to it.

## Teardown (when you want the RAM back)

```bash
wsl -d Ubuntu -u root -- k3s-uninstall.sh      # removes k3s entirely
```
