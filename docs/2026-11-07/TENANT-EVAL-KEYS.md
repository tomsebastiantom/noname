# Tenant eval keys — Vault is the only source

> **Status:** **implemented 2026-11-07** · **Scope:** where a tenant’s eval service-account key lives, how the
> worker/CLI reads it, and why there is no filesystem fallback.
> **Related:** [`EVAL-IDENTITY-RETIREMENT.md`](./EVAL-IDENTITY-RETIREMENT.md) · [`EVAL-STEP4-CONSTRAINT.md`](./EVAL-STEP4-CONSTRAINT.md)

---

## 1. Decision

**One tenant → one service-account key → one Vault path → one short-lived token → one tenant-scoped eval run.**

There is **no runtime file fallback**. If Vault is not configured or the secret is missing, eval fails closed with a
clear error.

## 2. Vault shape

```
secret/data/noname/orgs/<org>/eval/service-account
```

Payload:

```json
{
  "data": {
    "key": "{\"type\":\"serviceaccount\",\"keyId\":\"…\",\"userId\":\"…\",\"key\":\"-----BEGIN RSA PRIVATE KEY-----…\"}"
  }
}
```

The inner `key` is the ZITADEL JSON key file, serialized. One secret per tenant; no shared eval secret.

## 3. Flow

```
eval job for org X
  → read Vault path for org X only
  → sign a short-lived JWT assertion (kid = keyId)
  → exchange at ZITADEL /oauth/v2/token (scope = tenant project)
  → access token (org = X)
  → eval calls with x-org-id = X
```

- `yogastore` can only read `orgs/<yogastore>/eval/service-account`.
- `acme` can only read its own path.
- The token is short-lived and never stored; Vault stores the **key**, not the token.

## 4. Provisioning

`pnpm init:tenant-eval --org <org> --project <project>`:

1. ensures the `eval_reader` role on the tenant project;
2. creates `eval-runner-<org>` in the tenant org;
3. if Vault already has the secret, reuses it;
4. otherwise creates a ZITADEL key and writes it to Vault;
5. grants `eval_reader`.

Provisioning itself **requires** `VAULT_ADDR` + `VAULT_TOKEN`; it will not write a local key.

## 5. Runtime

| Consumer | Read |
|---|---|
| eval worker | `readTenantEvalKey(job.orgId)` → Vault |
| CLI | `readTenantEvalKey(resolvedOrgId)` → Vault |
| tests | inject a fake key; never a filesystem path |

`createServiceAccountToken` takes the key object, not a path.

## 6. Local development

Vault is already in the compose stack:

```
VAULT_ADDR=http://localhost:8200
VAULT_TOKEN=dev-root-token
VAULT_MOUNT=secret
VAULT_PATH_PREFIX=noname
```

The repository `.env` may point at a cluster address; for local runs override `VAULT_ADDR` to localhost. That is an
environment selection, not a fallback: the code still reads Vault only.

## 7. Verification (2026-11-07)

| Check | Result |
|---|---|
| Seed | demo tenant key written to `noname/orgs/<org>/eval/service-account` |
| Provisioning rerun | `Key: Vault … (exists)` — no duplicate key |
| CLI | `noname eval --tenant yogastore --mode dev` → **60 pass, 0 fail, 9 skip** |
| File reads | none; the CLI/worker loader only calls Vault |
| Missing Vault | fails closed (`VAULT_ADDR and VAULT_TOKEN are required…`) |

## 8. Production policy (not yet applied locally)

Local uses the dev root token, so the policy boundary is not exercised. Production needs:

- one Vault policy per tenant path, or a templated policy
  (`secret/data/noname/orgs/{{identity.entity.aliases…}}/eval/service-account`);
- eval worker/CLI roles that can read **only** their tenant path;
- AppRole/Kubernetes auth instead of the root token;
- audit devices enabled;
- rotation: create a new ZITADEL key, write it to Vault, let the old key expire, revoke it.

Those are deployment steps, not code paths. The code already treats Vault as the only source.

## 9. What this does not solve

- Vault availability is now on the eval critical path (fail closed).
- Token caching is in-process and short (≤10 min); revocation is bounded by that TTL.
- Per-tenant keys still require a provisioning call per tenant; onboarding should call it automatically.
