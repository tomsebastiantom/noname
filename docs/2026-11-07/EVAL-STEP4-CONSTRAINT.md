# Eval step 4 — why a single platform account cannot replace `nsv.` directly

> **Status:** **option A chosen and tenant provisioning implemented 2026-11-07**; CLI/worker switch and `nsv.`
> deletion pending.
> **Scope:** migrating eval from `nsv.` to the `eval-runner` service account, then deleting `nsv.` and the mint
> script.
> **Related:** [`EVAL-IDENTITY-RETIREMENT.md`](./EVAL-IDENTITY-RETIREMENT.md) · [`PLATFORM-ACCOUNTS-PROVISIONING.md`](./PLATFORM-ACCOUNTS-PROVISIONING.md)

---

## 1. What eval actually calls

The eval CLI/worker does not only hit `/api/eval/context`. It reads tenant-scoped data:

| Call | Scope | Guard today |
|---|---|---|
| `/api/eval/context` | one org | `machines:read` machine token, `x-org-id` = tenant |
| `/api/machines/definitions` | one org | `machines:read` |
| `/api/documents/layout`, `/api/documents/...` | one org | tenant permissions (`layout.publish` etc.) |
| `/api/tenants/:slug/catalog` | one org | edge/public |

Every one of those routes binds the request to **one org** (`x-org-id` + HMAC) and checks a tenant permission.
The `nsv.` token carries `orgId = tenant`, which is why it works.

## 2. Why `eval-runner` in the platform org does not work as a drop-in

A single platform service account has:

- `orgId = PLATFORM_ORG_ID`;
- platform-project roles;
- no tenant-project roles.

If the CLI sends `x-org-id = tenant`, the platform token still has no tenant permissions, and the document routes
reject it. If it sends `PLATFORM_ORG_ID`, the document routes read the platform org, not the tenant. Relaxing the
org/permission checks on tenant routes to accept the platform token would be a **broad cross-tenant read bypass** —
exactly what the platform boundary is supposed to prevent.

## 3. Options

| Option | How | Pros | Cons |
|---|---|---|---|
| **A. One eval service account per tenant** | provision an `eval-runner` account in each tenant org with a read-only role; worker selects the key for the job’s org; CLI selects by tenant | preserves every existing org/permission check; least privilege; no route changes | provisioning per tenant; N keys; worker holds a key map |
| **B. Platform read-across** | platform token + a new `eval:tenant_read` check on tenant data routes; context sets target org | one account | broad read path; every tenant route must be audited; role/permission resolution must be added to the generic actor path |
| **C. Eval proxy endpoints** | new `/api/eval/tenant/:org/...` endpoints that proxy tenant data under one platform permission | one account; explicit surface | new endpoints for every read; duplicate routing; large |
| **D. Keep `nsv.`** | no change | zero | rejected (custom credential) |

**Recommendation: A.** It is the only option that does not weaken org isolation and does not require a new proxy
surface. It also matches the “one read-only identity per tenant” model that the D4 role map already assumes.

## 4. What A requires

1. **Tenant provisioning hook** — when a tenant is created (seed/onboarding), create:
   - a project role `eval_reader` on the tenant project (or reuse `machines:read` via an existing role);
   - a service account `eval-runner` in the tenant org;
   - a key stored in the secret manager under `tenants/<org>/eval-runner`;
   - a grant for `eval_reader`.
2. **Worker key selection** — `EvalJobData` already carries `orgId`; the worker resolves the key for that org
   (secret manager, not a global env).
3. **CLI** — `noname eval --tenant <slug>` resolves the org and loads that tenant’s key; no `--token`.
4. **Eval guard** — the token role `eval_reader` maps to `machines:read` **server-side** (ZITADEL does not put
   machine roles in the token; same finding as step 2).
5. **Delete** `scripts/mint-service-token.ts` and the `nsv.` verifier; remove `--token` from the CLI.
6. **Audit** — eval reads are audited (who read which tenant), and `eval_runner` becomes the actor.

## 5. Why this is not in the same commit

It needs a tenant-provisioning decision and a secret-storage decision:

- where per-tenant keys live (Vault vs env map vs KMS);
- whether the key is created at tenant onboarding or lazily on first eval;
- how the worker authenticates to the secret store.

Those are product/ops decisions, not a token swap. Implementing A without them would create a key sprawl that is
worse than `nsv.`.

## 6. Acceptance for step 4

1. `noname eval --tenant yogastore` authenticates with that tenant’s service-account token; no `--token`.
2. `/api/eval/context` and tenant data reads use `x-org-id = tenant`.
3. A platform token cannot read tenant data (no cross-org bypass).
4. `nsv.` and `mint-service-token.ts` are gone; no `nsv.` references remain.
5. Worker logs show `eval-runner` as the actor for that tenant.
6. Per-tenant key lifecycle is documented and revocable.

## 8. Progress — tenant account and context (2026-11-07)

**Option A implemented for provisioning and the read path:**

- `scripts/init/tenant-eval-account.ts` (`pnpm init:tenant-eval --org <org> --project <project>`):
  creates project role `eval_reader`, service account `eval-runner-<org>`, key under
  `zitadel_keys/tenants/<org>/eval-runner-sa.json`, and the grant.
- `SERVICE_ROLE_PERMISSIONS.eval_reader → machines:read`; `requireAuthenticatedActor` resolves grants
  server-side when a token has no role-derived permissions (service accounts).
- Live: token exchanged for the demo tenant; `GET /api/eval/context` with `x-org-id=<tenant>` → **200**
  (`capabilities`, `extensions`, `roles`).

**Still pending:** CLI/worker use the tenant key, remove `--token`, delete `nsv.` and
`scripts/mint-service-token.ts`, remove the machine-token branch from guards, and audit the actor.



- `eval-runner` exists in the **platform** org (step 2) for the eventual platform eval path, but it is **not** used
  by the CLI/worker yet.
- `nsv.` remains the eval credential until option A is provisioned.
- Steps 1–3 of the sequence are complete.
