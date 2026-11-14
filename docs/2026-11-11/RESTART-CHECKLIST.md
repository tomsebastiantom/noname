# Local stack — restart checklist

> **Status:** verified 2026-11-13 · Companion to [`LOCAL-RANCHER-ENV.md`](./LOCAL-RANCHER-ENV.md)
> **Why this file exists:** the main doc has a non-UTF-8 character from an earlier edit, so this checklist is kept
> separate until that file is rewritten.

---

## After a Windows reboot or a Rancher Desktop restart

Rancher Desktop starts itself. Then:

```powershell
pnpm rancher forwards              # Zitadel only — the other seven services are NodePorts
pnpm --filter @noname/server dev   # :3000
pnpm --filter @noname/client dev   # :5173
pnpm --filter @noname/workers dev  # :8787  (edge)
```

## What comes back on its own

| Thing | Restored by | Verified |
|---|---|---|
| postgres `30432`, redis `30379`, clickhouse `30123`, vault `30200`, keto `30466/30467`, s3 `30900` | Rancher guest agent, from the NodePort Services | ✅ survived an engine restart |
| jaeger, nango | Traefik ingress on host port 80 (`*.localhost`) | ✅ |
| Zitadel `8080` | **nothing** — re-created by `pnpm rancher forwards` | ✅ dies with the engine |

## What never needs doing again

- keeping a terminal open for the forward — it is owned by the **Rancher Desktop process**;
- re-adding forwards in the UI;
- rewriting `.env` — the ports are fixed.

## Checks

```powershell
curl.exe http://localhost:3000/health                            # 200
curl.exe http://localhost:8080/.well-known/openid-configuration  # 200
curl.exe http://127.0.0.1:30200/v1/sys/health                     # 200  (NodePort)
```

## If a port is missing

| Symptom | Cause | Fix |
|---|---|---|
| `8080` closed | Rancher restarted | `pnpm rancher forwards` |
| `30xxx` closed | Service missing / cluster not ready | `kubectl -n noname get svc`; re-apply `deploy/overlays/local` |
| everything closed | engine stopped | start Rancher Desktop; wait for node `Ready` |
