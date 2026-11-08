# Platform accounts provisioning — step 2

> **Status:** **implemented and verified 2026-11-07** · **Scope:** create the platform org, platform project,
> `platform_operator` / `eval_operator` roles, and the `release-operator` / `eval-runner` service accounts with
> keys and grants.
> **Related:** [`PLATFORM-OPERATOR-DESIGN.md`](./PLATFORM-OPERATOR-DESIGN.md) · [`CONTROL-PLANE-IMPLEMENTATION.md`](./CONTROL-PLANE-IMPLEMENTATION.md) · [`EVAL-IDENTITY-RETIREMENT.md`](./EVAL-IDENTITY-RETIREMENT.md)

---

## 1. What was provisioned

Script: `scripts/init/platform-accounts.ts` (`pnpm init:platform-accounts`).

| Object | Local value |
|---|---|
| Platform org | `noname-platform` (`PLATFORM_ORG_ID` in `.env`) |
| Platform project | `noname-platform` (`ZITADEL_PLATFORM_PROJECT_ID`) |
| Role | `platform_operator` — group `Platform` |
| Role | `eval_operator` — group `Platform` |
| Service account | `release-operator` → key `zitadel_keys/release-operator-sa.json`, grant `platform_operator` |
| Service account | `eval-runner` → key `zitadel_keys/eval-runner-sa.json`, grant `eval_operator` |

The platform org/project are **separate from the tenant project** (`noname-dev`). Tenant roles are untouched.

## 2. Idempotency

Second run:

```
Platform org: 3986… (from PLATFORM_ORG_ID)
Platform project: 3986… (from ZITADEL_PLATFORM_PROJECT_ID)
Role platform_operator: exists
Role eval_operator: exists
Service account release-operator: 3986… (reused)
Key release-operator: zitadel_keys/release-operator-sa.json (exists)
Grant platform_operator: exists
Service account eval-runner: 3986… (reused)
Key eval-runner: zitadel_keys/eval-runner-sa.json (exists)
Grant eval_operator: exists
```

No duplicate org/project/role/account/key/grant is created.

## 3. Token exchange — verified, with one important finding

Both service-account keys sign a JWT assertion (RS256, `kid` = key id) and exchange it at
`/oauth/v2/token` (`grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`).

| Check | Result |
|---|---|
| Exchange | **200** for both accounts |
| `sub` | the service-account user id |
| `aud` | contains the platform project id when the project scope is requested |
| **roles claim** | **absent** — ZITADEL does not include service-account project roles in the access token by default |

The **grant exists** (`ListUserGrants`: `roleKeys=platform_operator`, `projectId=<platform project>`), but the token
does not carry it. This is a ZITADEL behavior for machine users, not a provisioning bug.

## 4. Consequence for the guard (step 3)

The guard cannot read roles from the token payload. It must resolve them **server-side**:

1. verify the access token through JWKS (existing path) → `sub`, `aud`;
2. confirm `sub` is a service account (or simply look up grants for `sub`);
3. call ZITADEL **ListUserGrants** with the server’s backend credentials, filtered to
   `projectId = ZITADEL_PLATFORM_PROJECT_ID`;
4. require `roleKeys` to include `platform_operator` (or `eval_operator` for eval);
5. cache the result briefly (e.g. 60 s) because grants change rarely.

This mirrors the existing D4 role-map read for humans (`/api/eval/context`) and keeps authorization server-side.
The token proves **who**; ZITADEL proves **what role**.

## 5. Migration and safety

- Tenant project/roles: untouched.
- `nsv.` eval credential: still present until step 4; not affected by this provisioning.
- Keys: `zitadel_keys/*.json` is gitignored, mode 0600; `.env` only stores paths.
- No app schema change; the accounts are IdP objects only.

## 6. Next

1. Guard + dry-run rollout, with server-side grant resolution.
2. Eval moves to `eval-runner`.
3. ZITADEL credential-lifecycle audit (account/role/key events).

## 7. Acceptance (observed)

- [x] platform org/project created once; second run reuses them;
- [x] both roles exist;
- [x] both service accounts exist with keys and grants;
- [x] both keys exchange for access tokens (200);
- [x] role absence from the token is recorded, with the server-side resolution plan;
- [ ] guard enforces the role (step 3).
