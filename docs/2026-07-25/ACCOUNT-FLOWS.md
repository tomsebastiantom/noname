# Account Flows — Forgot Password, Sign-Up, MFA

> **Date:** 2026-07-25  
> **Status:** ✅ Implemented (forgot password, sign-up, MFA login + TOTP enrollment)  
> **Related:** [`EMBEDDED-LOGIN.md`](./EMBEDDED-LOGIN.md), [`ORG-AUTH-CONFIG.md`](./ORG-AUTH-CONFIG.md), [`LOGIN-UI.md`](./LOGIN-UI.md)

---

## Principle

Passwords and MFA secrets **never** live in Postgres. ZITADEL owns users, credentials, and policies. Our server stays a **broker** — same pattern as email login today (`POST /api/auth/:slug/login` → Session API).

---

## What exists today

| Flow | Status |
|------|--------|
| Email + password login | ✅ Session API + JWT |
| Social (Google/GitHub/Apple/custom) | ✅ IdP redirect + callback |
| Toggle password on/off | ✅ `allowPassword` → login UI |
| Forgot password | ✅ Request + email link + reset form |
| Create account (sign-up) | ✅ When `allowSignUp` enabled |
| MFA challenge (TOTP at login) | ✅ Second step on `/login?mfa=1` |
| MFA enrollment (TOTP setup) | ✅ `/account/security` — QR + verify code |
| Invite-only vs open registration | ✅ `allowSignUp: false` default |

---

## Config (`tenant_settings.auth`)

| Flag | Default | Admin toggle |
|------|---------|--------------|
| `allowPassword` | `true` | Auth settings |
| `allowPasswordReset` | `true` (when password on) | Auth settings |
| `allowSignUp` | `false` | Auth settings |

Public flags on `GET /api/auth/:slug/config`: `allowPassword`, `allowSignUp`, `allowPasswordReset`.

---

## API routes

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/auth/:slug/password-reset/request` | `{ email }` → ZITADEL reset email (always `{ ok: true }`) |
| `POST` | `/api/auth/:slug/password-reset/confirm` | `{ userId, verificationCode, newPassword }` |
| `POST` | `/api/auth/:slug/register` | `{ email, password, givenName?, familyName? }` |
| `POST` | `/api/auth/:slug/login` | Returns `{ accessToken }` or `{ mfaRequired, sessionId, sessionToken, authRequestId }` |
| `POST` | `/api/auth/:slug/mfa/verify` | Complete login after TOTP |
| `POST` | `/api/auth/:slug/mfa/totp/register` | Start TOTP enrollment (JWT required) |
| `POST` | `/api/auth/:slug/mfa/totp/confirm` | Confirm enrollment with `{ code }` (JWT required) |

---

## Login UI views (`LoginForm`)

| View | Trigger |
|------|---------|
| Sign in | Default `/login` |
| Forgot password | Link on login form |
| Reset password | Email link → `/login?userID=…&code=…&orgID=…` |
| Sign up | Link when `allowSignUp` |
| MFA | After login → `/login?mfa=1` (session in `sessionStorage`) |
| TOTP setup | `/account/security` when signed in |

Admin: enable flows at `/admin/settings/auth`. Account security link also in admin sidebar and storefront AuthBar.

---

## Implementation files

| Layer | Path |
|-------|------|
| ZITADEL users API | `packages/server/src/domains/auth/zitadel-users.ts` |
| ZITADEL TOTP enrollment | `packages/server/src/domains/auth/zitadel-mfa.ts` |
| Session login + MFA | `packages/server/src/domains/auth/zitadel-client.ts` |
| Broker service | `packages/server/src/domains/auth/service.ts` |
| HTTP routes | `packages/server/src/domains/auth/api.ts` |
| Client API | `packages/client/src/auth/account-flows.ts` |
| Login UI | `packages/client/src/core/components/LoginForm.tsx` |
| MFA enrollment UI | `packages/client/src/core/components/AccountSecurityForm.tsx` |
| Actions | `packages/client/src/core/actions/auth.ts` |

---

## Future (not implemented)

- SMS/email OTP factors beyond TOTP
- User disable/remove in admin UI
- ZITADEL org-wide password policy UI

---

## References

- [ZITADEL — Password reset custom login UI](https://zitadel.com/docs/guides/integrate/login-ui/password-reset)  
- [ZITADEL — MFA custom login UI](https://zitadel.com/docs/guides/integrate/login-ui/mfa)  
- [`EMBEDDED-LOGIN.md`](./EMBEDDED-LOGIN.md)
