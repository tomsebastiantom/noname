# Retiring `nsv.` — eval moves to the ZITADEL service-account model

> **Status:** proposed migration · **Date:** 2026-11-07 (America/Toronto)
> **Driver:** one credential model only. The platform operator already uses a ZITADEL service account; the eval
> service still uses the custom `nsv.` HMAC token. That is the last custom platform credential and it should go.
> **Related:** [`PLATFORM-OPERATOR-DESIGN.md`](./PLATFORM-OPERATOR-DESIGN.md) · [`CONTROL-PLANE-IMPLEMENTATION.md`](./CONTROL-PLANE-IMPLEMENTATION.md)

---

## 1. Where `nsv.` is used today (code-verified)

| Consumer | How it gets the token | Scope |
|---|---|---|
| CLI `noname eval --token` | operator supplies an `nsv.` token minted by `scripts/mint-service-token.ts` | one org, `machines:read` |
| eval worker (`domains/eval/job.ts`) | mints `nsv.` per job with `machines:read` | one org |
| `scripts/mint-service-token.ts` | signs with `SERVICE_TOKEN_SECRET` / `WORKER_SERVER_SECRET` | one org |
| edge headers | CLI/worker also send `x-user-id: admin@zitadel.localhost`, `x-role: admin` | **demo identity** |

It is **not** used by the platform operator (D17-B uses a ZITADEL service account).

## 2. Why it must be replaced, not documented around

- a shared signing secret can mint any listed permission;
- no `aud`, no `jti`, no per-token revocation;
- the worker sends a demo admin identity in edge headers;
- two credential models for the same kind of actor (machine) is a duplicate mechanism.

## 3. Options for eval identity

| Option | How | Pros | Cons |
|---|---|---|---|
| **A. One platform eval service account** | service account in the platform org; role `eval_operator` → `machines:read` + `eval:tenant_read`; `/api/eval/context?tenant=` accepts an explicit target org | one account, standard tokens, no per-tenant provisioning | **cross-tenant read** of definitions; must be read-only + audited |
| **B. One service account per tenant org** | each org gets an eval service account with `machines:read`; worker selects the key per tenant | least privilege | provisioning/key management scales with tenants; worker holds N keys |
| **C. Keep `nsv.` as an exception** | no change | smallest | violates the one-credential rule; rejected |

**Recommendation: A**, because eval is already a read-only measurement service and the alternative (N accounts and
N private keys) is operationally heavy for a platform function. The cross-tenant read is bounded by:

- a **read-only** permission (`eval:tenant_read`, no writes to tenant data);
- platform org only (`PLATFORM_ORG_ID`), same guard pattern as the operator;
- an explicit `tenant` parameter, never “all tenants”;
- one audit row per context read (who read which tenant), and the existing gate decision audit.

If a tenant contract forbids platform read access, B is the fallback for that tenant.

## 4. Target shape

```
platform org
  service account: eval-runner
  role:            eval_operator → machines:read, eval:tenant_read, eval:record_write
  auth:            private-key JWT → access token (aud, jti, 15 min)

CLI / worker
  token = ZITADEL access token (no nsv)
  GET /api/eval/context?tenant=yogastore
  POST /api/eval/record { tenantSlug, result }
```

- `x-org-id` is the **platform org**; the target tenant is an explicit query/body field.
- The API resolves the target tenant, checks `eval:tenant_read` / `eval:record_write`, and audits the read/write.
- No demo admin identity in headers.

## 5. Implementation plan

| Step | Change |
|---|---|
| 1 | add `platform_operator`-style role `eval_operator` to the platform org (init) with `machines:read` + `eval:tenant_read` + `eval:record_write` |
| 2 | create service account `eval-runner`, private key, client id; store key in secret manager |
| 3 | `/api/eval/context` and `/api/eval/record` accept target tenant; guard requires platform org + eval permissions |
| 4 | CLI: replace `--token` with service-account credentials (client id + private key path) and token exchange |
| 5 | worker: replace `signServiceToken` with the service-account token; remove demo email headers |
| 6 | delete `scripts/mint-service-token.ts`, remove `nsv.` from `service-token.ts` (or delete the module if unused) |
| 7 | audit reads/writes; tests; e2e |

**No schema change.** Permissions are additive; the eval tables are untouched.

## 6. Migration and compatibility

- `--token` remains accepted for **one release** as a deprecated path? **No** — that would keep the duplicate.
  Remove it in the same change; the CLI errors with “use service-account credentials”.
- Existing `nsv.` tokens stop working when the verifier is removed; mint script deleted.
- Historical Evidence rows are unaffected.
- Agents (`nag.`) are a separate actor type and are **not** part of this migration.

## 7. Acceptance

1. `noname eval` authenticates with a ZITADEL access token only.
2. `/api/eval/context` returns the target tenant’s data with a read audit row.
3. A tenant admin token cannot call either eval endpoint.
4. No `nsv.` string remains in eval code, scripts, or docs.
5. `mint-service-token.ts` is deleted.
6. Worker logs show the service-account actor, not a demo admin email.

## 8. What this does not solve

- Agent identity (`nag.`) remains until its own OIDC/token-exchange migration.
- Per-tenant isolation for eval read is weaker under option A; option B is the fallback for tenants that require it.
