# Login UI

> **Date:** 2026-07-25  
> **Status:** Phase 1 ✅ · Social UI scaffold ✅ · Per-org auth 📋 ([`ORG-AUTH-CONFIG.md`](./ORG-AUTH-CONFIG.md))  
> **Related:** [`EMBEDDED-LOGIN.md`](./EMBEDDED-LOGIN.md), [`ORG-AUTH-CONFIG.md`](./ORG-AUTH-CONFIG.md), [`CLIENT-ACTIONS.md`](./CLIENT-ACTIONS.md), [`ARCHITECTURE-MAP.md`](./ARCHITECTURE-MAP.md)

---

## Goal

Sign-in on **our** `/login` page — Clerk-like UX, ZITADEL as IdP only (no hosted ZITADEL login redirect).

- Email/password + optional social (Google first)
- Copy/branding via **layout spec props** — not CMS content entries
- Side effects via **`executeAction`** → `core/actions/auth.ts` → `auth/*`

---

## What we have today

| Piece | Status |
|-------|--------|
| `LoginForm`, `AuthLayout`, `SocialLoginButtons` | ✅ |
| shadcn polish (Alert, Separator, password toggle) | ✅ |
| `POST .../auth/login` server broker | ✅ |
| OAuth start + `/auth/callback` | ✅ scaffold |
| Per-org social config (Postgres) | ❌ env shortcut — see [`ORG-AUTH-CONFIG.md`](./ORG-AUTH-CONFIG.md) |
| Forgot password / MFA / sign-up | ❌ later |

---

## Client layers (no drift)

```
main.tsx          → fetch spec + manifest, Bearer headers, <Renderer />
layout spec       → LoginForm props (title, providers, logoUrl)
catalog component → UI only; executeAction("login" | "idpLogin")
core/actions/auth → login, idpLogin, logout
auth/*.ts         → HTTP + token storage (not imported from components)
```

Exception: `/auth/callback` bootstrap route calls `auth/idp-login.ts` directly (outside spec renderer).

Details: [`CLIENT-ACTIONS.md`](./CLIENT-ACTIONS.md) · [`EMBEDDED-LOGIN.md`](./EMBEDDED-LOGIN.md)

---

## Login page load

```
GET {orgId}.localhost:5173/login
  → GET /api/edge/schema/{orgId}?template=login
  → GET /api/tenants/{orgId}/auth/config   (provider merge)
  → GET /api/tenants/{orgId}/catalog       (core only)
  → Renderer(LoginForm from spec)
```

Login text comes from **layout spec props**, not `$state` / content CMS.

---

## Token flows

**Email/password:**

```
LoginForm → executeAction("login")
  → POST /api/tenants/{orgId}/auth/login
  → ZITADEL Session API (server) → JWT
  → sessionStorage + cookie → redirect
```

**Social (scaffold until Phase A2):**

```
SocialLoginButtons → executeAction("idpLogin")
  → OAuth redirect → /auth/callback → JWT
```

Provider list = **layout spec `providers` ∩ `GET auth/config`** (today config reads env — replace per [`ORG-AUTH-CONFIG.md`](./ORG-AUTH-CONFIG.md)).

---

## LoginForm props (catalog schema)

| Prop | Source | Merchant-editable? |
|------|--------|-------------------|
| `title`, `subtitle`, `footerText`, `logoUrl` | Layout spec | Yes (admin later) |
| `providers` | Layout spec (intent) | Yes |
| `redirectPath`, `showPasswordToggle` | Layout spec | Yes |
| `"Continue with Google"` button text | `SocialLoginButtons` | No — platform default |

---

## Remaining UI phases

| Phase | Scope | Status |
|-------|-------|--------|
| 1 Visual polish | AuthLayout, shadcn, divider, password toggle | ✅ |
| 2 Social sign-in | Buttons + OAuth routes + **per-org config (A2)** | UI ✅ · config 📋 |
| 3 Account flows | Forgot password, sign-up, MFA | 📋 |
| 4 Admin branding | Auth settings UI writes spec + settings | Phase C |

Social Phase 2 is **not production-done** until [`ORG-AUTH-CONFIG.md`](./ORG-AUTH-CONFIG.md) steps 1–4 ship.

---

## Stays in core (never an extension)

`LoginForm`, `AuthLayout`, `SocialLoginButtons`, server auth domain, `/login` template — see [`EXTENSION-LIFECYCLE.md`](./EXTENSION-LIFECYCLE.md).

---

## References

- [`EMBEDDED-LOGIN.md`](./EMBEDDED-LOGIN.md) — why server broker for password
- [`ORG-AUTH-CONFIG.md`](./ORG-AUTH-CONFIG.md) — per-org providers, no env shortcuts
- [`AUTH-IDENTITY.md`](./AUTH-IDENTITY.md) — JWT + edge
- Code: `packages/client/src/core/components/LoginForm.tsx`, `packages/server/src/domains/auth/`
