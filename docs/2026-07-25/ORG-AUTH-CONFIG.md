# Per-Org Auth Configuration — Clerk-Style Vision

> **Date:** 2026-07-25  
> **Status:** ✅ A2 + Phase C auth/content admin (Google IdP on Save, generic CMS)  
> **Related:** [`LOGIN-UI.md`](./LOGIN-UI.md), [`AUTH-IDENTITY.md`](./AUTH-IDENTITY.md), [`ADMIN-UI-LATER.md`](./ADMIN-UI-LATER.md), [`EXTENSION-LIFECYCLE.md`](./EXTENSION-LIFECYCLE.md), [`ARCHITECTURE-MAP.md`](./ARCHITECTURE-MAP.md), [`CONTENT-RENDER-PIPELINE.md`](./CONTENT-RENDER-PIPELINE.md)

---

## Target vs current

| Piece | Target (per org) | Today | Production-ready? |
|-------|------------------|-------|-------------------|
| Email/password login | Server broker → ZITADEL Session API | Same | ✅ Yes |
| JWT session | `session.ts` + edge | Same | ✅ Yes |
| Login copy / logo | Login **layout spec** props | Seeded spec | ✅ Yes (merchant edit via admin later) |
| Which social buttons show | **`tenant_settings.auth`** + ZITADEL IdP on **that org** | Postgres `auth.providers` + `idpIds` per org | ✅ Yes |
| `GET .../auth/config` | Read **Postgres** for `:orgId` | Same | ✅ Yes |
| IdP credentials | ZITADEL Management API per org (secrets server-only) | Admin Save → ZITADEL (Google) | ✅ Google |
| Merchant toggles | Admin **Auth settings** UI | `/admin/settings/auth` | ✅ Google + password |
| Button labels (`Continue with Google`) | Platform defaults in `SocialLoginButtons` | Hardcoded | ✅ Yes (optional overrides in `tenant_settings.auth` later) |

**Rule:** Runtime never reads `ZITADEL_GOOGLE_IDP_ID`. Seed may use it once to populate Postgres for local dev.

## Build order (must complete in this order)

Do **not** move to Phase C admin or “production auth” until steps 1–4 exist. Step 5 (admin UI) can follow immediately after.

```
✅ 1. tenant_settings.auth schema     Postgres document shape (providers, idpIds, allowPassword)
✅ 2. Persist + read per orgId        GET /auth/config from documents, not process.env
✅ 3. ZITADEL IdP per org             Google via Management API on admin Save (`zitadel-management.ts`)
✅ 4. Merge runtime                   LoginForm: spec.providers ∩ auth/config (from step 2)
✅ 5. Admin Auth settings (Phase C)   Google OAuth → ZITADEL + Postgres; generic content CMS
✅ 6. Remove env shortcut             No listEnabledProviders / resolveIdpId in runtime
```

**What can ship before step 6:** Email login, layout spec branding, commerce validation (Phase B).  
**What cannot ship as “done” before steps 1–4:** Per-org Google/GitHub social login for real merchants.

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
| `tenant_settings.auth` | ❌ flags + public URLs only | Admin UI | `providers: ["google"]` |
| Login layout spec | ❌ | Admin / editor | `"title": "Welcome back"` |
| Platform component | ❌ | No — platform owns | `"Continue with Google"` default label |

**Never** put OAuth secrets in layout spec or client bundle.  
**Never** use `.env` IdP ids as the per-org source of truth — env is dev bootstrap only until step 6 above.

### Where login “content” lives (not one CMS)

| Content type | Source | Merchant-editable? |
|--------------|--------|-------------------|
| Welcome title, subtitle, footer, logo URL | Login **layout spec** props | Yes (admin / editor) |
| Which providers merchant *wants* | Layout spec `providers[]` | Yes |
| Which providers *work* for this org | `tenant_settings.auth` + ZITADEL IdP | Yes (admin toggles + OAuth setup) |
| Standard OAuth button text, dividers, loading copy | Core components (`SocialLoginButtons`, `LoginForm`) | No — platform UX |
| Products, pages, blog | Documents **content** types | Yes — separate from auth |

Login page merchant copy uses the **same layout-spec pipeline** as the storefront, not Contentful and not hardcoded strings in components (except platform chrome like “Continue with Google”).

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

### Already have (production-ready)

| API | Purpose |
|-----|---------|
| `POST /api/tenants/:orgId/auth/login` | Email/password → JWT |
| `GET/PUT /api/tenants/:orgId/catalog` | Extension manifest |
| `GET/PUT /api/documents/tenant_settings/default` | Locales, SEO, integrations (extend with `auth` block) |
| `POST/PUT /api/documents/layout` | Login layout spec publish |
| Edge JWT + HMAC | Post-login API access |

### Per-org auth (A2 ✅)

| API | Purpose |
|-----|---------|
| `GET /api/tenants/:orgId/auth/config` | Public-safe providers from `tenant_settings.auth` (no `idpIds`) |
| `PUT /api/tenants/:orgId/auth/config` | Seed/admin: save providers + `idpIds` per org |
| `GET/PUT /api/documents/tenant_settings/default` | Full settings including `auth` block |

OAuth routes (`idp/start`, callback) use per-org `idpIds` from Postgres.

### Still to build (Phase C+)

| API / service | Purpose |
|---------------|---------|
| GitHub / Apple IdP on Save | Same Management API pattern as Google |
| `GET/PUT .../auth/policies` | MFA, signup (proxy ZITADEL) |
| Login layout branding from admin | Publish login layout spec (title, logo) |
| Create content entry UI | `ContentEntryAdmin` is edit-only today |

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

## What admin UI provides (Clerk-like)

Shipped in Phase C ([`ADMIN-UI-LATER.md`](./ADMIN-UI-LATER.md)) — **Auth settings** + **Content**:

| Admin screen | Configures | Writes to | Status |
|--------------|------------|-----------|--------|
| **Auth settings** | Toggle Google + password; Google OAuth client ID/secret | ZITADEL IdP API + `tenant_settings.auth` | ✅ Google |
| **Content** | CMS entry fields by content type | `content` documents via documents API | ✅ |
| **Login appearance** | Title, subtitle, logo, layout | Login layout spec (draft → publish) | 📋 |
| **Security** | MFA required for admins, password policy | ZITADEL org policies | 📋 |
| **Users** (later) | List users, invite, roles | ZITADEL Management API | 📋 |

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
| Visual polish (AuthLayout, Alert, password toggle) | [`LOGIN-UI.md`](./LOGIN-UI.md) | ✅ |
| Google / social buttons + callback | [`LOGIN-UI.md`](./LOGIN-UI.md) | ✅ |
| MFA / forgot password / sign-up UI | [`LOGIN-UI.md`](./LOGIN-UI.md) | Later |
| Per-org theme from settings | This doc § tenant_settings.auth | With admin |

### Backend / ZITADEL

| Item | Doc | Phase |
|------|-----|-------|
| `tenant_settings.auth` schema + read in GET auth/config | This doc § Build order | ✅ A2 |
| Per-org IdP CRUD (Management API) | This doc | ✅ Google |
| Remove env IdP shortcut | This doc | ✅ A2 |
| IdP start + OAuth callback routes | [`LOGIN-UI.md`](./LOGIN-UI.md) | ✅ scaffold |
| Persist catalog manifest in Postgres | [`EXTENSION-LIFECYCLE.md`](./EXTENSION-LIFECYCLE.md) | Platform |
| Auto-register extension machines on enable | [`EXTENSION-LIFECYCLE.md`](./EXTENSION-LIFECYCLE.md) | Phase B+ |

### Admin UI

| Item | Doc | Phase |
|------|-----|-------|
| AdminShell + `/admin` | [`ADMIN-UI-LATER.md`](./ADMIN-UI-LATER.md) | ✅ |
| Auth settings (Google) | This doc | ✅ |
| Generic content CMS | [`ADMIN-UI-LATER.md`](./ADMIN-UI-LATER.md) | ✅ |
| Login layout editor (props panel) | [`VISUAL_EDITOR.md`](../2026-07-11/VISUAL_EDITOR.md) | After admin shell |
| User management (optional) | [`BUILD_PLAN.md`](../2026-05-23/BUILD_PLAN.md) | Later |

### Docs already aligned

| Doc | Covers |
|-----|--------|
| [`EMBEDDED-LOGIN.md`](./EMBEDDED-LOGIN.md) | Why server broker for password |
| [`AUTH-IDENTITY.md`](./AUTH-IDENTITY.md) | org_id, JWT, edge |
| [`EXTENSION-LIFECYCLE.md`](./EXTENSION-LIFECYCLE.md) | Login not an extension |
| [`LOGIN-UI.md`](./LOGIN-UI.md) | Login UI phases |
| [`CONTENT-RENDER-PIPELINE.md`](./CONTENT-RENDER-PIPELINE.md) | CMS → resolved spec |
| [`ARCHITECTURE-MAP.md`](./ARCHITECTURE-MAP.md) | Master index |
| [`ROADMAP-PHASES.md`](./ROADMAP-PHASES.md) | Build order |

### Docs to update when implementing

- [`BUILD_PLAN.md`](../2026-05-23/BUILD_PLAN.md) — still says “ZITADEL provides login pages”; update to “we embed, ZITADEL provides API”

---

## Implementation order (recommended)

```
✅ 1. Login UI Phase 1        — email login + layout spec props
✅ 2. Phase B                   — commerce validation
✅ 3. Content render pipeline  — CMS → $state → edge resolve
✅ 4. Login social + OAuth      — UI + routes; config from Postgres
✅ 5. tenant_settings.auth      — Postgres + GET/PUT auth/config per orgId
✅ 6. Per-org ZITADEL IdP API    — Google on admin Save (Management API)
✅ 7. Phase C Admin (partial)    — Auth settings + ContentEntryAdmin
📋 8. Layout admin + visual editor
```

---

## Clerk comparison (what we replicate vs skip)

| Clerk feature | Our approach |
|---------------|--------------|
| Hosted UI components | **Our** LoginForm (core) — more control |
| Org-level SSO/social toggles | ZITADEL IdP per org + `tenant_settings.auth` |
| Dashboard to configure auth | **Admin Auth settings** (`/admin/settings/auth`) ✅ |
| User management UI | ZITADEL console or our admin proxy (later) |
| Session management SDK | Our session.ts + JWT (already) |
| Billing for MAU | N/A — self-hosted ZITADEL |

---

## References

- [`LOGIN-UI.md`](./LOGIN-UI.md) — UI phases
- [`EXTENSION-LIFECYCLE.md`](./EXTENSION-LIFECYCLE.md) — login in core, spec props
- [`ADMIN-UI-LATER.md`](./ADMIN-UI-LATER.md) — admin shell timing
- [`docs/2026-05-23/BUILD_PLAN.md`](../2026-05-23/BUILD_PLAN.md) — per-org branded sign-in (original vision)
- [ZITADEL — Identity providers](https://zitadel.com/docs/guides/integrate/identity-providers)
- [ZITADEL — Organization login settings](https://zitadel.com/docs/guides/manage/console/org-settings)
