# Operator guard and dry-run rollout

> **Status:** **implemented and verified 2026-11-07** · **Scope:** `requirePlatformOperator`, platform-only
> permissions, and the dry-run `POST /api/releases/:id/rollout`.
> **Related:** [`PLATFORM-OPERATOR-DESIGN.md`](./PLATFORM-OPERATOR-DESIGN.md) · [`PLATFORM-ACCOUNTS-PROVISIONING.md`](./PLATFORM-ACCOUNTS-PROVISIONING.md) · [`CONTROL-PLANE-IMPLEMENTATION.md`](./CONTROL-PLANE-IMPLEMENTATION.md)

---

## 1. What was implemented

| Piece | Detail |
|---|---|
| Platform permissions | `releases:platform_read/write`, `eval:tenant_read`, `eval:record_write`, `platform:audit_read` |
| Tenant exclusion | `PLATFORM_ONLY_PERMISSIONS` is filtered out of tenant role expansion; **`admin` no longer equals `ALL_PERMISSIONS`** |
| Service-role map | `SERVICE_ROLE_PERMISSIONS`: `platform_operator` → release read/write; `eval_operator` → eval read/record |
| Guard | `requirePlatformOperator(c)` in `domains/release/platform-guard.ts` |
| Grant resolution | token verifies via JWKS → `sub`; roles resolved server-side with `ListAuthorizations` on the **platform project** |
| Dry-run endpoint | `POST /api/releases/:id/rollout` with explicit `orgIds`, cap 100, dedupe, no writes |
| Platform releases | `ReleaseService.getAnyOrg` / `findByIdAnyOrg`; a wave release is owned by the platform org |

## 2. Why roles are resolved server-side

ZITADEL does not put machine-user project roles in the access token (verified in step 2). The guard therefore:

1. verifies the token through the existing JWKS path and takes `payload.sub`;
2. requires `x-org-id === PLATFORM_ORG_ID`;
3. calls `ListAuthorizations(platformOrg, platformProjectId)`;
4. requires `platform_operator` among the caller’s roles;
5. maps roles to permission keys.

The token proves **who**; ZITADEL proves **what role**.

## 3. Dry-run rules

- `dryRun` defaults to `true`; `false` returns **400** (`Write path is not enabled yet`).
- release must be owned by the platform org (`409` otherwise) and `ready`;
- migration set must be promotable (D16);
- `orgIds` explicit, deduped, max 100; `PLATFORM_ORG_ID` is skipped with `platform_org`;
- an org already on the release is skipped with `already_on_release`;
- no pointer or audit write occurs.

## 4. Live verification

A platform release was created under the platform org (bootstrap credential), marked ready, then dry-run with the
`release-operator` service-account token:

```
POST /api/releases/:id/rollout
{ "orgIds": ["<demo-org>", "<platform-org>", "<demo-org>"], "dryRun": true }

200 {
  "releaseId": "504fc2bb…",
  "dryRun": true,
  "results": [
    { "orgId": "<demo-org>", "status": "eligible" },
    { "orgId": "<platform-org>", "status": "skipped", "reason": "platform_org" }
  ]
}
```

- dedupe: the demo org appears once;
- no token → **401**;
- write path (`dryRun:false`) is rejected (code path; endpoint test planned with the write block).

Unit tests cover the guard: platform role accepted; tenant org 403; missing role 403; unset env 503.

## 5. Limits recorded

- **Tenant existence is not checked** in dry-run (no tenant catalog yet); eligibility is org-id based.
- **No role cache** — each guarded request lists authorizations. A 60 s cache is the next optimisation.
- Only **platform-owned** releases can be rolled out; tenant releases stay tenant-scoped.
- The write path is intentionally disabled; step 4/eval migration is separate.

## 6. Tests

| Check | Result |
|---|---|
| Guard unit | 4/4 |
| Permissions exclusion | `admin` has no platform-only permission; service roles map correctly |
| Release domain | 55/55 |
| Auth + release targeted | 67/67 |
| Full server suite (before this doc) | 660/660, 147 files |
| Live dry-run | 200, eligible/skipped as above |

## 7. Next

1. Role-resolution cache.
2. Tenant catalog/status for true eligibility.
3. Enable the write path (wave) once steps 1–2 hold.
4. Eval migration to `eval-runner`; delete `nsv.`.
