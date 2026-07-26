# Account Flows — Forgot Password, Sign-Up, MFA

> **Date:** 2026-07-25  
> **Status:** 📋 Planned (not implemented)  
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
| Forgot password | ❌ |
| Create account (sign-up) | ❌ |
| MFA challenge | ❌ |
| Invite-only vs open registration | ❌ |

---

## 1. Forgot password

**User story:** Customer clicks “Forgot password?” → enters email → receives reset link → sets new password.

**ZITADEL approach:** Use [custom login UI](https://zitadel.com/docs/guides/integrate/login-ui) password reset / verification flows via Management or Session APIs (not browser ROPC).

**Our pieces:**

| Layer | Work |
|-------|------|
| Login UI | Link + email form + “check your email” state |
| Client action | `requestPasswordReset({ email })` |
| API | `POST /api/tenants/:orgId/auth/password-reset/request` |
| Server | Call ZITADEL to initiate reset for user in org |
| Config | Optional `tenant_settings.auth.allowPasswordReset` (default true when password enabled) |

**Complexity:** Medium — one new screen state, one broker endpoint, email delivery via ZITADEL.

---

## 2. Create account (sign-up)

**User story:** New customer registers on `{slug}.localhost/login` without admin creating them in ZITADEL console.

**ZITADEL approach:** Register user under org via Management API or self-registration policy if enabled on instance.

**Our pieces:**

| Layer | Work |
|-------|------|
| Admin | `allowSignUp: boolean` on `tenant_settings.auth` |
| Login UI | “Create account” tab/link when allowed |
| API | `POST /api/tenants/:orgId/auth/register` `{ email, password, profile? }` |
| Server | Create human user in ZITADEL org + optional email verify |
| Policies | Invite-only mode: `allowSignUp: false`, admins invite via ZITADEL UI |

**Complexity:** Medium–high — abuse/spam, email verification, terms acceptance, org scoping.

---

## 3. MFA

**User story:** After password succeeds, user enters TOTP code (or WebAuthn) before JWT is issued.

**ZITADEL approach:** Login policy + session checks for MFA requirement; Session API may return MFA pending state.

**Our pieces:**

| Layer | Work |
|-------|------|
| Admin | `requireMfaForAdmin` / `requireMfaForAll` flags (future) |
| Login UI | Second step: code input after password |
| API | Extend login to multi-step OR `POST …/auth/mfa/verify` with session handle |
| Server | Forward MFA check to ZITADEL Session API |

**Complexity:** High — multi-step login state, recovery codes, different factors.

---

## Suggested build order

```
1. Forgot password     ← smallest UX win, reuses email field
2. Sign-up             ← needs admin flag + ZITADEL user create
3. MFA                 ← policy + second login step
```

---

## Config shape (planned)

```typescript
interface TenantAuthConfig {
  providers: string[];
  idpIds: Record<string, string>;
  allowPassword: boolean;
  allowSignUp?: boolean;           // default false
  allowPasswordReset?: boolean;    // default true when allowPassword
  requireMfaForAdmin?: boolean;    // future
  providerLabels?: Record<string, string>;
  providerIconAssets?: Record<string, MediaRef>;
}
```

Login layout spec still owns **copy/branding**; `tenant_settings.auth` owns **which flows are enabled**.

---

## Out of scope (for now)

- Storing passwords or MFA seeds in Postgres  
- Client-side password grant  
- Replacing ZITADEL hosted console for user admin  

---

## References

- [ZITADEL — Username & password custom login UI](https://zitadel.com/docs/guides/integrate/login-ui/username-password)  
- [`EMBEDDED-LOGIN.md`](./EMBEDDED-LOGIN.md) — why server broker exists  
- [`DOCUMENT-REFS.md`](./DOCUMENT-REFS.md) — unified ref shape; resolve API in [`RESOLVE-REFS.md`](./RESOLVE-REFS.md)
