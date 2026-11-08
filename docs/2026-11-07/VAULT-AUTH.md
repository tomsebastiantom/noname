# Vault authentication for eval — explicit modes, per-tenant tokens

> **Status:** **implemented 2026-11-07** (token mode live; AppRole/Kubernetes unit-tested; Vault roles/policies are
> deployment work).
> **Related:** [`TENANT-EVAL-KEYS.md`](./TENANT-EVAL-KEYS.md) · [`EVAL-IDENTITY-RETIREMENT.md`](./EVAL-IDENTITY-RETIREMENT.md)

---

## 1. Rule

**One Vault deployment. Per-tenant paths. Per-tenant tokens. No root token in production. No fallback chain.**

The deployment chooses exactly one auth mode with `VAULT_AUTH_MODE`:

| Mode | Use | Token scope |
|---|---|---|
| `token` | local development only | the dev token (refused when `NODE_ENV=production`) |
| `agent` | Vault Agent / CSI writes a token file | workload policy |
| `approle` | non-k8s workers/CLI | **per-tenant role + secret id** |
| `kubernetes` | k8s workloads | **per-tenant Vault role** bound to the service account |

If `VAULT_AUTH_MODE` is unset, eval fails closed.

## 2. AppRole — per-tenant credentials

```
VAULT_AUTH_MODE=approle
VAULT_ADDR=https://vault.example
VAULT_APPROLE_CREDENTIALS={"<org-a>":{"roleId":"…","secretId":"…"},"<org-b>":{"roleId":"…","secretId":"…"}}
```

Each tenant has its **own role** and **own policy**:

```hcl
# policy eval-<org-a>
path "secret/data/noname/orgs/<org-a>/eval/*" {
  capabilities = ["read"]
}
```

```bash
vault policy write eval-<org-a> eval-<org-a>.hcl
vault write auth/approle/role/eval-<org-a> token_policies=eval-<org-a>
# then read role_id / generate a secret_id for that tenant
```

The loader asks for the token of the **job’s org**; it never receives a token that can read another tenant.

## 3. Kubernetes — per-tenant roles

```
VAULT_AUTH_MODE=kubernetes
VAULT_ADDR=https://vault.example
VAULT_KUBERNETES_ROLES={"<org-a>":"eval-<org-a>","<org-b>":"eval-<org-b>"}
VAULT_KUBERNETES_JWT_PATH=/var/run/secrets/kubernetes.io/serviceaccount/token
```

Each Vault role is bound to the workload’s service account and a tenant policy. The login uses the projected
service-account JWT, not a static token.

## 4. Agent — token file

```
VAULT_AUTH_MODE=agent
VAULT_TOKEN_FILE=/var/run/secrets/vault/token
```

Vault Agent/CSI owns renewal; the app only reads the file. This is the simplest production mode when the platform
already runs an injector.

## 5. Local development

```
VAULT_ADDR=http://localhost:8200
VAULT_TOKEN=dev-root-token
VAULT_AUTH_MODE=token
```

`token` is rejected when `NODE_ENV=production`, so it cannot silently become the production path.

## 6. Verification

| Check | Result |
|---|---|
| Token mode | CLI eval → **60 pass, 0 fail, 9 skip** |
| Missing mode | fails closed: `VAULT_AUTH_MODE is required` |
| Production + token | rejected: `local development only` |
| AppRole parsing | per-tenant role/secret map accepted |
| AppRole login | mocked Vault login uses the tenant’s role and secret |
| Missing tenant credential | fails closed |
| Unit tests | **8/8** (`vault-auth.test.ts`) |

## 7. Not yet done

- Vault policies/AppRoles for each tenant are **not** provisioned by this repository; they are deployment objects.
- Kubernetes auth is implemented in code but not exercised against a cluster.
- Token cache is in-process (`lease_duration − 60s`); revocation is bounded by that TTL.
- CLI still needs one credential source per environment; it does not fall back.

## 8. Why not a shared read-all token

A token with `secret/data/noname/orgs/*/eval/*` makes every tenant key readable by one compromised worker. That is
the same class of mistake as the old shared `nsv.` secret, just moved into Vault. The Vault path layout is not the
security boundary — **the token’s policy is**.
