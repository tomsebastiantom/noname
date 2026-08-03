# Security Handoff — Auth & Admin Hardening (2026-07-25)

> **Date:** 2026-07-25  
> **Purpose:** Security-focused issues found during the org MFA + team admin session, fixes applied, test steps, and known gaps for the next handoff.  
> **Related:** [`ORG-AUTH-CONFIG.md`](./ORG-AUTH-CONFIG.md) · [`ACCOUNT-FLOWS.md`](./ACCOUNT-FLOWS.md) · [`PLATFORM-STATUS.md`](./PLATFORM-STATUS.md)

---

## Summary

This session added org MFA policy, team user admin, and then ran a security/edge-case pass against the auth stack. Several bugs were found where auth settings did not persist, sensitive routes were unauthenticated, or login tokens could not call ZITADEL user APIs. All critical items below are **fixed** in code; remaining gaps are documented as intentional dev behavior or future work.

---

## Issues found → fixes applied

| # | Issue | Severity | Fix |
|---|-------|----------|-----|
| 1 | `requireMfaForAdmin` and `teamRoles` dropped on Postgres read | **High** | `toTenantSettings()` in `postgres.ts` now uses `normalizeAuthConfig(data.auth)` instead of rebuilding a partial auth object |
| 2 | `PUT /api/auth/:slug/config` accepted updates with only `x-org-id` (no JWT) | **Critical** | Route requires `requireAuthenticatedUser`; returns **401** without Bearer token |
| 3 | TOTP enrollment failed with `Errors.Token.Invalid (AUTH-7fs1e)` | **High** | Login OIDC scope now includes `urn:zitadel:iam:org:project:id:zitadel:aud` so user JWTs can call `POST /v2/users/{id}/totp` |
| 4 | JWT-only API calls had no `x-user-id` → TOTP/register failed | **Medium** | `jwt-user.ts` extracts `sub` from Bearer token; `requireAuthenticatedUser` uses it as fallback |
| 5 | `PUT /api/documents/tenant_settings/default` partial `auth` patch wiped `requireMfaForAdmin` / `teamRoles` | **High** | Uses `mergeAuthConfig(current, partialPatch)` — do **not** `normalizeAuthConfig()` the patch body (that defaults omitted flags to `false`) |
| 6 | Team routes (`/api/auth/:slug/users`, invite, role) had no admin check | **High** | `requireTeamAdmin` on config PUT, user list, invite, and role update; **403** for non-admins once roles are assigned |
| 7 | ZITADEL user list returned **405** | **Medium** | Fixed path: `POST /users` with `{ queries: [], limit, offset }` (not `/users/_search`) |
| 8 | `mfaEnrolled` always false after TOTP confirm | **High** | ZITADEL returns `{ otp: {} }` not `type: "TOTP"` — `userHasTotpFactor` now checks `otp` field |

---

## Auth model after fixes

### Public (no JWT)

- `GET /api/auth/:slug/config`, login, register, password-reset, OAuth start/callback, MFA verify at login

### Authenticated (JWT required)

- `GET /api/auth/:slug/session` — MFA policy + enrollment status for current user
- `POST /api/auth/:slug/mfa/totp/register` and `/confirm` — TOTP enrollment

### Admin only (JWT + team admin role)

- `PUT /api/auth/:slug/config`
- `GET /api/auth/:slug/users`
- `POST /api/auth/:slug/users/invite`
- `PUT /api/auth/:slug/users/:userId/role`

**Bootstrap rule:** if `tenant_settings.auth.teamRoles` is empty, every authenticated user is treated as **admin** so the first merchant setup works. Once any role is assigned, only users with `teamRoles[userId] === "admin"` pass `requireTeamAdmin`.

Roles are stored in Postgres (`tenant_settings.auth.teamRoles`); ZITADEL owns user records.

### Client-side MFA gate

When `requireMfaForAdmin` is true and the user has no TOTP, `main.tsx` redirects `/admin/*` → `/account/security?redirect=…&mfaRequired=1` before rendering admin shell.

---

## Key files touched

| Area | Path |
|------|------|
| Auth routes + guards | `packages/server/src/domains/auth/api.ts` |
| JWT `sub` fallback | `packages/server/src/domains/auth/jwt-user.ts` |
| Team role helpers | `packages/server/src/domains/auth/auth-config.ts` (`teamRoleForUser`, `isTeamAdmin`) |
| OIDC scope for user API | `packages/server/src/domains/auth/zitadel-client.ts` |
| Postgres auth persistence | `packages/server/src/domains/documents/adapters/postgres.ts` |
| Tenant settings auth merge | `packages/server/src/domains/documents/api.ts` |
| MFA policy client gate | `packages/client/src/main.tsx` |
| Admin MFA toggle | `packages/client/src/core/components/AuthSettingsForm.tsx` |
| Team admin UI | `packages/client/src/core/components/UsersAdminForm.tsx` |

---

## How to re-run security checks

**Prerequisites:** API `:3000`, edge `:8787`, ZITADEL `:8080`, demo seeded (`pnpm seed:demo`).

```bash
# Unit tests (includes jwt-user, auth-config, zitadel-mfa mocks)
pnpm test && pnpm typecheck
```

### Manual API checklist

| Step | Request | Expected |
|------|---------|----------|
| 1 | `PUT /api/auth/yogastore/config` with only `x-org-id`, no `Authorization` | **401** |
| 2 | Same route with admin Bearer token | **200** |
| 3 | Set `requireMfaForAdmin: true` via auth config PUT, then `PUT /api/documents/tenant_settings/default` with `{ auth: { allowPassword: true } }` | Response auth block still has `requireMfaForAdmin: true` |
| 4 | `POST /api/auth/yogastore/mfa/totp/register` with login JWT | **200** + `{ uri, secret }` |
| 5 | `GET /api/auth/yogastore/session` at edge without JWT | **302** redirect to login |
| 6 | `GET /api/auth/yogastore/users` without JWT | **401** |
| 7 | Same with admin JWT | **200** user list |
| 8 | Password reset for unknown email | **200** (no enumeration) |
| 9 | Register duplicate email (with `allowSignUp: true`) | **409** |
| 10 | Register when `allowSignUp: false` | **400** (“Sign-up is not enabled”) |

Login for tests: `admin@zitadel.localhost` / `NonameAdmin1!` via `POST /api/auth/yogastore/login` (through edge `:8787`).

### Browser checks

1. `/admin/settings/auth` — toggle “Require MFA for admin access”; save persists after reload.
2. Enable MFA policy → visit `/admin` → redirect to `/account/security?mfaRequired=1`.
3. `/admin/settings/users` — list, invite, change role.
4. `/account/security` — “Set up authenticator app” returns QR/secret (after fix #3).
5. After confirm, `/account/security` shows “Two-factor authentication is enabled”.
6. With `requireMfaForAdmin: true` and TOTP enrolled, `/admin` loads (no redirect to security).

### E2E result (2026-07-25)

- API: register → confirm → `GET /api/auth/:slug/session` returns `mfaEnrolled: true` (after fix #8).
- Browser: login at `/login?redirect=/admin` → lands on `/admin` dashboard with MFA policy on.
- Browser: `/account/security` reflects enrolled state after session poll on mount.

---

## Known gaps (not fixed — document for next session)

| Gap | Notes |
|-----|-------|
| **MFA policy server-side on document writes** | Only client gates `/admin/*`. Direct `POST/PUT` to `:3000` documents API with JWT + `x-org-id` does not check MFA. Edge HMAC path is the production boundary; add server middleware if direct API access is a concern. |
| **Documents API open on `:3000` in dev** | No JWT required for content/layout writes when hitting API directly with `x-org-id`. By design for local seed/scripts; edge enforces JWT in normal traffic. |
| **Unknown store slug at edge** | Unresolvable slug → **400** “org id required”, not **404**. Edge proxy limitation when KV/API resolve fails. |
| **TOTP full E2E in browser** | ✅ Verified 2026-07-25 — see E2E result below |
| **Editor vs admin on CMS routes** | Team roles enforced on auth admin routes only; document write APIs do not yet distinguish editor vs admin. |
| **Seed script and auth config PUT** | `scripts/seed/demo.ts` writes Google IdP via `PUT tenant_settings/default` (not auth config PUT) to avoid JWT requirement during seed. |

---

## Incident notes

- During security testing, `requireMfaForAdmin` may have been left `true` via direct API before the auth-config JWT fix. Restore for dev:

```bash
# After logging in (Bearer token from /api/auth/:slug/login):
curl -X PUT http://localhost:3000/api/auth/yogastore/config \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"requireMfaForAdmin": false}'
```

- Test invite user may exist in ZITADEL from earlier runs (`editor.test+…@example.com`). Safe to ignore or remove in ZITADEL console.

---

## Suggested next security work

1. Server-side MFA enforcement on document **write** routes when `requireMfaForAdmin && !mfaEnrolled`.
2. Editor vs admin authorization on CMS/document mutations.
3. Return **404** from edge when slug resolve fails (instead of generic 400).
4. Full TOTP enroll → confirm → admin-access browser E2E test.

---

*Update this file when new auth/security issues are found or closed.*
