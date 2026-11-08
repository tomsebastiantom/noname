# Retiring `nsv.` — eval moves to the ZITADEL service-account model

> **Status:** **implemented 2026-11-07** — per-tenant eval service accounts; `nsv.` and the mint script deleted.
> **Driver:** one credential model only. The platform operator already uses a ZITADEL service account; the eval
> service used the custom `nsv.` HMAC token. That was the last custom platform credential and it is gone.
> **Related:** [`PLATFORM-OPERATOR-DESIGN.md`](./PLATFORM-OPERATOR-DESIGN.md) · [`CONTROL-PLANE-IMPLEMENTATION.md`](./CONTROL-PLANE-IMPLEMENTATION.md)

---

## 1. Where `nsv.` was used (removed)

| Consumer | Then | Now |
|---|---|---|
| CLI `noname eval --token` | operator supplied an `nsv.` token | `--tenant` resolves the org and loads that tenant's service-account key |
| eval worker (`domains/eval/job.ts`) | minted `nsv.` per job | exchanges the tenant key for a short-lived access token |
| `scripts/mint-service-token.ts` | signed with `SERVICE_TOKEN_SECRET` / `WORKER_SERVER_SECRET` | **deleted** |
| edge headers | demo admin identity | service-account user id, `x-role: service` |

`nsv.` and `service-token.ts` are deleted; no code references remain.

## 2. Why it must be replaced, not documented around

- a shared signing secret can mint any listed permission;
- no `aud`, no `jti`, no per-token revocation;
- the worker sends a demo admin identity in edge headers;
- two credential models for the same kind of actor (machine) is a duplicate mechanism.

## 3. Chosen: per-tenant eval service accounts

Eval reads tenant-scoped routes (`/api/eval/context`, definitions, documents), so a single platform account cannot
replace `nsv.` without a cross-org read bypass or a proxy surface. The chosen model is **one eval service account per
tenant org**:

- the account lives in the tenant org and uses the tenant project role `eval_reader`;
- the token is bound to that org, so every existing org/permission check still applies;
- the CLI/worker select the key by the tenant org;
- no platform token can read tenant data.

This is least privilege and needs no route changes. The provisioning and live verification are in
[`EVAL-STEP4-CONSTRAINT.md`](./EVAL-STEP4-CONSTRAINT.md).

## 4. Target shape

```
tenant org (yogastore)
  service account: eval-runner-<org>
  role:            eval_reader -> machines:read
  auth:            private-key JWT -> access token (aud, jti, 15 min)

CLI / worker
  org  = resolve(tenant slug)
  key  = Vault: secret/noname/orgs/<org>/eval/service-account
  GET  /api/eval/context            (x-org-id = tenant)
  POST /api/eval/record             (x-org-id = tenant)
```

- `x-org-id` is the **tenant org**, never the platform org.
- No demo admin identity in headers; the actor is the service account.
- A platform eval account exists only for future platform-scoped eval; it is not used by the CLI/worker.

## 5. Implementation plan

| Step | Change |
|---|---|
| 1 | tenant role `eval_reader`; one `eval-runner-<org>` account per tenant with a key and grant (`pnpm init:tenant-eval`) |
| 2 | key stored in Vault at `secret/noname/orgs/<org>/eval/service-account` (no file fallback) |
| 3 | CLI resolves the org from the slug, loads the tenant key, exchanges it for an access token |
| 4 | worker uses the job org to load the same tenant key |
| 5 | server resolves `eval_reader` grants when the token has no role claim (ZITADEL behavior) |
| 6 | delete `nsv.` verifier, `scripts/mint-service-token.ts`, and the machine-token branch |

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
