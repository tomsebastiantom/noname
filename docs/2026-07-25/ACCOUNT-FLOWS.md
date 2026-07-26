# Account Flows — Forgot Password, Sign-Up, MFA

> **Date:** 2026-07-25  
> **Status:** ✅ Implemented (forgot password, sign-up, MFA login step)  
> **Related:** [`EMBEDDED-LOGIN.md`](./EMBEDDED-LOGIN.md), [`ORG-AUTH-CONFIG.md`](./ORG-AUTH-CONFIG.md), [`LOGIN-UI.md`](./LOGIN-UI.md)

---

## Principle

Passwords and MFA secrets **never** live in Postgres. ZITADEL owns users, credentials, and policies. Our server stays a **broker** — same pattern as email login today (`POST …/auth/login` → Session API).

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
| Invite-only vs open registration | ✅ `allowSignUp: false` default |

---

## Config (`tenant_settings.auth`)

| Flag | Default | Admin toggle |
|------|---------|--------------|
| `allowPassword` | `true` | Auth settings |
| `allowPasswordReset` | `true` (when password on) | Auth settings |
| `allowSignUp` | `false` | Auth settings |

Public flags on `GET /api/tenants/:slug/auth/config`: `allowPassword`, `allowSignUp`, `allowPasswordReset`.

---

## API routes

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/tenants/:slug/auth/password-reset/request` | `{ email }` → ZITADEL reset email (always `{ ok: true }`) |
| `POST` | `/api/tenants/:slug/auth/password-reset/confirm` | `{ userId, verificationCode, newPassword }` |
| `POST` | `/api/tenants/:slug/auth/register` | `{ email, password, givenName?, familyName? }` |
| `POST` | `/api/tenants/:slug/auth/login` | Returns `{ accessToken }` or `{ mfaRequired, sessionId, sessionToken, authRequestId }` |
| `POST` | `/api/tenants/:slug/auth/mfa/verify` | Complete login after TOTP |

---

## Login UI views (`LoginForm`)

| View | Trigger |
|------|---------|
| Sign in | Default `/login` |
| Forgot password | Link on login form |
| Reset password | Email link → `/login?userID=…&code=…&orgID=…` |
| Sign up | Link when `allowSignUp` |
| MFA | After login → `/login?mfa=1` (session in `sessionStorage`) |

Admin: enable flows at `/admin/settings/auth`.

---

## Implementation files

| Layer | Path |
|-------|------|
| ZITADEL users API | `packages/server/src/domains/auth/zitadel-users.ts` |
| Session login + MFA | `packages/server/src/domains/auth/zitadel-client.ts` |
| Broker service | `packages/server/src/domains/auth/service.ts` |
| HTTP routes | `packages/server/src/domains/auth/api.ts` |
| Client API | `packages/client/src/auth/account-flows.ts` |
| Login UI | `packages/client/src/core/components/LoginForm.tsx` |
| Actions | `packages/client/src/core/actions/auth.ts` |

---

## Future (not implemented)

- MFA **registration** setup in admin (TOTP enroll UI)
- SMS/email OTP factors beyond TOTP login step
- `requireMfaForAdmin` policy flag
- User list / invite admin screen

---

## References

- [ZITADEL — Password reset custom login UI](https://zitadel.com/docs/guides/integrate/login-ui/password-reset)  
- [ZITADEL — MFA custom login UI](https://zitadel.com/docs/guides/integrate/login-ui/mfa)  
- [`EMBEDDED-LOGIN.md`](./EMBEDDED-LOGIN.md)
