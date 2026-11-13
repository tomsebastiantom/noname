# Tenant directory — the inventory a wave must consult (step 4)

> **Status:** **implemented and verified 2026-11-12** · **Scope:** roadmap step 4. Adds a platform-only tenant
> inventory with lifecycle status, and makes rollout eligibility **fail closed** against it.
> **Related:** [`../2026-11-07/IMPLEMENTATION-ROADMAP.md`](../2026-11-07/IMPLEMENTATION-ROADMAP.md) ·
> [`../2026-11-07/OPERATOR-GUARD-DRY-RUN.md`](../2026-11-07/OPERATOR-GUARD-DRY-RUN.md)

---

## 1. The gap this closes

A tenant existed only as an `org_id` value scattered across tables — `tenant_settings` is a row in the generic
`documents` table, not a table of tenants. So the control plane had **no inventory** and no lifecycle state.

Concretely, before this change the rollout dry-run answered:

```
orgIds: ["<real tenant>", "typo-org"]  →  both "eligible"
```

A typo, a suspended tenant, or the platform org itself all looked promotable.

## 2. What was added

| Piece | Detail |
|---|---|
| Table | `tenant_directory` (migration `0010_neat_beyonder`) |
| Columns | `org_id` PK, `slug` unique, `status` (`active｜suspended｜offboarding`), `plan`, `region`, `excluded_reason`, `is_platform`, timestamps |
| Service | `createTenantDirectoryService` — `list`, `get`, `upsert`, `backfill`, `selectability` |
| Routes | `GET /api/platform/tenants`, `GET /api/platform/tenants/:orgId`, `PUT /api/platform/tenants/:orgId` |
| Guard | every route passes `requirePlatformOperator` + the operator's permission set |
| Rollout | `POST /api/releases/:id/rollout` now skips with a reason instead of assuming eligible |

### Two fields, on purpose

`status` is the lifecycle. `excluded_reason` is **why an otherwise-active tenant is skipped** (legal hold,
maintenance, customer opt-out). Keeping them separate means “active but excluded” stays one status plus one
reason, not two competing status fields.

### Fail closed

`selectability(orgId)` returns `unknown_tenant` when the directory has no row. It never assumes an unknown org is
fine — that is what stops a typo from becoming an orphan release pointer and an audit row for a non-existent tenant.

## 3. Why `backfill` exists

Existing tenants predate the table. `backfill()` reads `documents where type='tenant_settings' and key='default'`
and inserts a directory row per slug, `onConflictDoNothing`. Idempotent, and it is the only migration path from
“org id exists in data” to “tenant is in the inventory”.

## 4. A real bug found while verifying

The platform route returned **403** for a valid platform service-account token. Cause: the generic machine
fallback in `requireAuthenticatedActor` resolved grants against `ZITADEL_PROJECT_ID` — the **tenant** project —
while a platform service account holds its roles on the **platform** project.

Fixed in `domains/auth/guards.ts`: when `x-org-id === PLATFORM_ORG_ID`, the grant lookup uses
`ZITADEL_PLATFORM_PROJECT_ID`. `SERVICE_ROLE_PERMISSIONS.platform_operator` also gained `RELEASES_READ/WRITE`,
because the operator creates the wave release **in the platform org** using ordinary release routes.

## 5. Verification

Unit — `tenant-directory/service.test.ts` (6 tests): unknown org is not eligible; active is; suspended and
offboarding are refused; excluded active tenant is refused; platform org is refused; list hides platform and
filters by status.

Live — platform service-account token against the running API:

```
GET /api/platform/tenants                     → 200
   999000111          suspended-demo  suspended
   398655937176469540 yogastore       active
GET /api/platform/tenants?status=active       → 200, only yogastore
GET /api/platform/tenants/does-not-exist      → 404

POST /api/releases/:id/rollout  (dryRun, four orgs)
   398655937176469540 → eligible
   999000111          → skipped  tenant_suspended
   typo-org           → skipped  unknown_tenant
   399364356581621826 → skipped  platform_org
```

Targeted suites: `auth` + `release` + `tenant-directory` + `@noname/auth` → **164/164**.

## 6. Limits

- `PUT` is the only write path; there is no soft-delete and no status-change audit row yet (that belongs with
  audit phase B/C).
- `backfill()` is exposed as a service method but is **not** wired to a route; running it is an operator action.
- The directory does not verify that the org still exists in ZITADEL — it is our inventory, not the IdP's.
- Eligibility is now catalog + status only. **Gate verdicts are still missing** (roadmap step 5), so a tenant whose
  own checks failed is still reported `eligible`.

## 7. Next

Step 5 — per-tenant verdict lookup (`pass ｜ block ｜ unverified ｜ missing`) from the eval decision records, so the
wave can skip a blocked tenant instead of only an unknown or suspended one.
