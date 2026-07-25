# Per-Org Auth Configuration — Clerk-Style Vision

> **Date:** 2026-07-25  
> **Status:** Planned — master map for backend, ZITADEL, spec, and admin UI  
> **Related:** [`LOGIN-UI-MODERN-PLAN.md`](./LOGIN-UI-MODERN-PLAN.md), [`AUTH-IDENTITY.md`](./AUTH-IDENTITY.md), [`ADMIN-UI-LATER.md`](./ADMIN-UI-LATER.md), [`EXTENSION-LIFECYCLE.md`](./EXTENSION-LIFECYCLE.md)

---

## Vision

Each **org (store)** should configure auth **in UI**, without code deploys — similar to Clerk Organizations:

| Merchant configures in admin | Customer sees on `/login` |
|------------------------------|---------------------------|
| Enable Google / Apple / GitHub | Matching social buttons |
| Require MFA for admins | MFA step when needed |
| Logo, title, colors, layout style | Branded login page |
| Allow sign-up vs invite-only | Register link or hidden |
| Password + social mix | “Continue with Google” + email form |

**We do not add Clerk.** ZITADEL is the IdP; we build the **merchant settings UI** + **storefront login UI** + **server broker**.

---

## Three configuration layers (do not confuse)

```
┌─────────────────────────────────────────────────────────────┐
│ 1. ZITADEL (per org) — identity & credentials               │
│    Users, passwords, IdP connectors, MFA policies           │
│    Configured via: Admin API + our “Auth settings” admin UI │
└─────────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│ 2. Platform settings (Postgres) — what we expose on login     │
│    tenant_settings.auth OR login layout spec props            │
│    Which providers show, copy, logo URL, theme tokens         │
└─────────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│ 3. Login layout spec (json-render) — page structure           │
│    type: layout, key: login — LoginForm props + AuthLayout    │
│    Merchants edit via admin / visual editor — no new packages │
└─────────────────────────────────────────────────────────────┘
```

| Layer | Stores secrets? | Merchant edits? | Example |
|-------|-----------------|-----------------|---------|
| ZITADEL org | ✅ IdP client secrets | Via our admin (proxy to ZITADEL) | Google OAuth client ID |
| `tenant_settings` / auth config | ❌ flags + public URLs only | Admin UI | `providers: ["google"]` |
| Login layout spec | ❌ | Admin / editor | `"title": "Welcome back"` |

**Never** put OAuth secrets in layout spec or client bundle.

---

## Why login stays in core (spec — not extension)

From [`EXTENSION-LIFECYCLE.md`](./EXTENSION-LIFECYCLE.md):

- **LoginForm, AuthLayout, SocialLoginButtons** = platform core components
- **One implementation** for all professions (commerce, booking, …)
- Merchants customize via **spec props** + **tenant settings**, not by adding a “commerce login extension”

This **prevents**:

- Duplicate login UIs per extension
- Auth secrets leaking into extension packages
- Broken JWT flow when manifest disables an extension

```
❌  extensions/booking/LoginForm.tsx
✅  core/LoginForm + layout spec props { title, providers, logoUrl }
```

---

## What ZITADEL must support (per org)

One ZITADEL instance; **each store = one ZITADEL organization** ([`AUTH-IDENTITY.md`](./AUTH-IDENTITY.md)).

| Capability | ZITADEL feature | Our UI exposes it? | Status |
|------------|-----------------|-------------------|--------|
| Email/password | Session API + users | LoginForm | ✅ |
| JWT access tokens | OIDC app (JWT type) | — | ✅ |
| Google / GitHub / Apple | Identity providers on org | Admin toggles + OAuth setup wizard | 📋 |
| MFA (TOTP, etc.) | Org/login policies | Admin “Security” section | 📋 |
| Password reset | ZITADEL reset flow | “Forgot password” link | 📋 |
| User registration | ZITADEL register / invite | Sign-up link or admin-only invite | 📋 |
| Roles (admin/customer) | ZITADEL roles in JWT | Edge HMAC `x-role` | ✅ |
| Audit / user list | ZITADEL console or API | Admin “Users” (later) | 📋 |

**Backend rule:** all ZITADEL Admin/Management calls that need secrets run on **server** (machine user or PAT), same as today’s password login broker ([`EMBEDDED-LOGIN.md`](./EMBEDDED-LOGIN.md)).

---

## What our backend must add

### Already have

| API | Purpose |
|-----|---------|
| `POST /api/tenants/:orgId/auth/login` | Email/password → JWT |
| `GET/PUT /api/tenants/:orgId/catalog` | Extension manifest |
| `GET/PUT /api/documents/tenant_settings/default` | Locales, SEO, integrations |
| `POST/PUT /api/documents/layout` | Login layout spec publish |
| Edge JWT + HMAC | Post-login API access |

### Need for Clerk-like org auth

| API / service | Purpose | Phase |
|---------------|---------|-------|
| `GET /api/tenants/:orgId/auth/config` | Public-safe login config (providers enabled, logo, theme) | Auth UI 2 |
| `PUT /api/tenants/:orgId/auth/config` | Admin: save auth display settings | Admin C |
| `GET .../auth/idp/:provider/start` | Start Google/social OAuth | Auth UI 2 |
| `POST .../auth/callback` or client `/auth/callback` | OAuth return → JWT | Auth UI 2 |
| `POST .../auth/idp` (admin) | Register IdP credentials in ZITADEL for this org | Admin C |
| `GET/PUT .../auth/policies` | MFA required, signup allowed (proxy ZITADEL) | Admin C |
| Server: sync login spec from auth config | Optional: admin saves settings → update login layout draft | Admin C |

### `tenant_settings` extension (planned shape)

Add to `TenantSettingsDTO` (or nested `auth` in layout meta):

```typescript
interface TenantAuthConfig {
  providers: ("google" | "github" | "apple")[];
  allowPassword: boolean;
  allowSignUp: boolean;
  requireMfaForAdmin: boolean;
  branding: {
    logoUrl: string | null;
    primaryColor: string | null;  // CSS var override in .noname-auth
  };
}
```

Login page load merges **tenant_settings.auth** into LoginForm props (edge or client), so merchants need not hand-edit JSON.

---

## What admin UI must provide (Clerk-like)

Build in **Phase C** ([`ADMIN-UI-LATER.md`](./ADMIN-UI-LATER.md)) — new section **Auth settings**:

| Admin screen | Configures | Writes to |
|--------------|------------|-----------|
| **Login appearance** | Title, subtitle, logo, layout (centered/split), footer text | Login layout spec (draft → publish) |
| **Sign-in methods** | Toggle Google/GitHub/email; order of buttons | `tenant_settings.auth` + ZITADEL IdP |
| **Google / OAuth setup** | Client ID/secret (encrypted server-side) | ZITADEL IdP API |
| **Security** | MFA required for admins, password policy | ZITADEL org policies |
| **Users** (later) | List users, invite, roles | ZITADEL Management API |

Merchant flow (target):

```
/admin/settings/auth
  → toggle “Continue with Google”
  → paste Google OAuth credentials (once)
  → upload logo, edit welcome text
  → Save → updates ZITADEL + tenant_settings + login layout draft
  → Publish login layout
  → /login immediately shows new branding (no deploy)
```

---

## Login page runtime (how config reaches UI)

```
GET {orgId}.localhost:5173/login
  │
  ├─► GET /api/edge/schema/{orgId}?template=login     → layout spec (LoginForm tree)
  ├─► GET /api/tenants/{orgId}/auth/config (public)  → providers, theme (no secrets)
  └─► catalog manifest (core only for login)

Client merges auth/config into LoginForm props
  → LoginForm renders social buttons + email form
  → User signs in → same JWT pipeline
```

Spec defines **structure** (“show LoginForm here”).  
Auth config defines **behavior** (which providers).  
Both are merchant-editable without code.

---

## Appropriate layouts (login vs storefront vs admin)

| Template | Route | Auth | Config source |
|----------|-------|------|---------------|
| `login` | `/login` | Public | Login layout spec + auth config |
| `home` / `store` | `/` | Public (optional Bearer) | Storefront layout spec + manifest extensions |
| `admin_dashboard` | `/admin` | JWT + admin role | Admin layout spec |

Merchants can have **different layout specs** per template — same json-render pipeline, different documents. Login layout is **independent** of commerce `home` layout ([`EXTENSION-LIFECYCLE.md`](./EXTENSION-LIFECYCLE.md)).

---

## Master checklist — what else we need to do

Cross-doc consolidated backlog:

### Login UI (client)

| Item | Doc | Phase |
|------|-----|-------|
| Visual polish (AuthLayout, Alert, password toggle) | [`LOGIN-UI-MODERN-PLAN.md`](./LOGIN-UI-MODERN-PLAN.md) §1 | Next |
| Google / social buttons + callback | [`LOGIN-UI-MODERN-PLAN.md`](./LOGIN-UI-MODERN-PLAN.md) §2 | After polish |
| MFA / forgot password / sign-up UI | [`LOGIN-UI-MODERN-PLAN.md`](./LOGIN-UI-MODERN-PLAN.md) §3 | Later |
| Per-org theme from settings | This doc § tenant_settings.auth | With admin |

### Backend / ZITADEL

| Item | Doc | Phase |
|------|-----|-------|
| IdP start + OAuth broker routes | [`LOGIN-UI-MODERN-PLAN.md`](./LOGIN-UI-MODERN-PLAN.md) §2 | Auth UI 2 |
| Per-org IdP CRUD (Management API) | This doc | Admin C |
| `tenant_settings.auth` schema + API | This doc | Admin C |
| Public `GET .../auth/config` | This doc | Auth UI 2 |
| Persist catalog manifest in Postgres | [`EXTENSION-LIFECYCLE.md`](./EXTENSION-LIFECYCLE.md) | Platform |
| Auto-register extension machines on enable | [`EXTENSION-LIFECYCLE.md`](./EXTENSION-LIFECYCLE.md) | Phase B+ |

### Admin UI

| Item | Doc | Phase |
|------|-----|-------|
| AdminShell + `/admin` | [`ADMIN-UI-LATER.md`](./ADMIN-UI-LATER.md) | Phase C |
| Auth settings screens (Clerk-like) | This doc | Phase C |
| Login layout editor (props panel) | [`VISUAL_EDITOR.md`](../2026-07-11/VISUAL_EDITOR.md) | After admin shell |
| User management (optional) | [`BUILD_PLAN.md`](../2026-05-23/BUILD_PLAN.md) | Later |

### Docs already aligned

| Doc | Covers |
|-----|--------|
| [`EMBEDDED-LOGIN.md`](./EMBEDDED-LOGIN.md) | Why server broker for password |
| [`AUTH-IDENTITY.md`](./AUTH-IDENTITY.md) | org_id, JWT, edge |
| [`EXTENSION-LIFECYCLE.md`](./EXTENSION-LIFECYCLE.md) | Login not an extension |
| [`LOGIN-UI-MODERN-PLAN.md`](./LOGIN-UI-MODERN-PLAN.md) | Modern UI phases |
| [`ROADMAP-PHASES.md`](./ROADMAP-PHASES.md) | A→B→C order |

### Docs to update when implementing

- [`BUILD_PLAN.md`](../2026-05-23/BUILD_PLAN.md) — still says “ZITADEL provides login pages”; update to “we embed, ZITADEL provides API”
- [`LOGIN-UI-PLAN.md`](./LOGIN-UI-PLAN.md) — stale checklist (shadcn marked ❌)
- [`ADMIN-UI-LATER.md`](./ADMIN-UI-LATER.md) — add Auth settings section (link this doc)

---

## Implementation order (recommended)

```
1. Login UI Phase 1     — pretty email login (core spec props)
2. Phase B              — commerce validation (parallel OK)
3. Login UI Phase 2     — Google + server IdP routes + callback
4. tenant_settings.auth + GET auth/config
5. Phase C Admin        — shell + Auth settings UI (Clerk-like toggles)
6. Visual editor        — edit login layout props without JSON
7. MFA, sign-up, users  — incremental
```

---

## Clerk comparison (what we replicate vs skip)

| Clerk feature | Our approach |
|---------------|--------------|
| Hosted UI components | **Our** LoginForm (core) — more control |
| Org-level SSO/social toggles | ZITADEL IdP per org + `tenant_settings.auth` |
| Dashboard to configure auth | **Admin Auth settings** (Phase C) |
| User management UI | ZITADEL console or our admin proxy (later) |
| Session management SDK | Our session.ts + JWT (already) |
| Billing for MAU | N/A — self-hosted ZITADEL |

---

## References

- [`LOGIN-UI-MODERN-PLAN.md`](./LOGIN-UI-MODERN-PLAN.md) — UI phases
- [`EXTENSION-LIFECYCLE.md`](./EXTENSION-LIFECYCLE.md) — login in core, spec props
- [`ADMIN-UI-LATER.md`](./ADMIN-UI-LATER.md) — admin shell timing
- [`docs/2026-05-23/BUILD_PLAN.md`](../2026-05-23/BUILD_PLAN.md) — per-org branded sign-in (original vision)
- [ZITADEL — Identity providers](https://zitadel.com/docs/guides/integrate/identity-providers)
- [ZITADEL — Organization login settings](https://zitadel.com/docs/guides/manage/console/org-settings)
