# Modern Login UI — Plan (Clerk / Google-style)

> **Date:** 2026-07-25  
> **Status:** Planned — implement in phases after Phase A auth works  
> **Related:** [`LOGIN-UI-PLAN.md`](./LOGIN-UI-PLAN.md), [`EMBEDDED-LOGIN.md`](./EMBEDDED-LOGIN.md), [`ROADMAP-PHASES.md`](./ROADMAP-PHASES.md)

---

## Goal

Make `/login` feel like a **modern product** (Clerk, Vercel, Linear, Google Sign-In patterns):

- Clean layout, strong typography, subtle background
- **Social sign-in** (Google first, then Apple/GitHub optional)
- Email/password as secondary path (“Or continue with email”)
- Scoped platform styling (`.noname-auth`) — not overridden by extensions
- Still **our UI** — ZITADEL stays IdP only; same JWT pipeline after login

---

## What we have today

| Piece | Status |
|-------|--------|
| Email/password login | ✅ Server Session API + `LoginForm` |
| shadcn Card, Input, Button | ✅ Basic — functional, not polished |
| `.noname-auth` scoped shell | ✅ CSS variables on login route |
| Layout spec (`template=login`) | ✅ Seeded — title, subtitle, redirectPath |
| Google / social login | ❌ |
| AuthLayout (split hero + form) | ❌ |
| Forgot password / sign up | ❌ |
| MFA step UI | ❌ |
| Per-org logo / branding props | ❌ |

---

## Reference patterns (what “modern” means)

| Pattern | Examples | Priority |
|---------|----------|----------|
| Centered card on soft background | Clerk, Supabase | Phase 1 |
| Social buttons above email form | Google, GitHub | Phase 2 |
| “Or continue with email” divider | Clerk, Auth0 | Phase 1 |
| Logo + product name header | Vercel, Linear | Phase 1 |
| Inline error alert (not plain text) | shadcn Alert | Phase 1 |
| Password show/hide toggle | Most modern logins | Phase 1 |
| Split layout (brand panel + form) | Stripe, some SaaS | Phase 1 optional |
| Forgot password link | Standard | Phase 2 |
| MFA / OTP second step | Clerk, Google | Phase 3 |
| Magic link / passkeys | Later | Phase 4 |

---

## Architecture (unchanged principles)

```
Login UI        →  core platform (LoginForm, AuthLayout) — NOT an extension
Side effects    →  auth/login.ts + server auth domain
Social login    →  still ZITADEL OIDC; may need OAuth redirect for Google consent
After login     →  same JWT → edge → HMAC → API
Spec JSON       →  only props (title, logoUrl, providers[]) — no CSS, no secrets
```

Merchants customize **copy and branding via spec props**, not by forking auth code.

---

## Schema variables (new props — plan)

Extend `LoginForm` in `core/catalog-schemas.ts`:

```typescript
LoginForm: {
  props: z.object({
    title: z.string(),
    subtitle: z.string().nullable(),
    redirectPath: z.string().nullable(),
    // Phase 1 — visual
    logoUrl: z.string().url().nullable(),
    showPasswordToggle: z.boolean().default(true),
    layout: z.enum(["centered", "split"]).default("centered"),
    // Phase 2 — providers
    providers: z.array(z.enum(["google", "github", "apple"])).default([]),
    // Phase 2 — links
    forgotPasswordUrl: z.string().url().nullable(),
    signUpUrl: z.string().url().nullable(),
    footerText: z.string().nullable(),
  }),
}
```

Example seeded spec:

```json
{
  "type": "LoginForm",
  "props": {
    "title": "Welcome back",
    "subtitle": "Sign in to manage your store",
    "logoUrl": null,
    "layout": "centered",
    "providers": ["google"],
    "redirectPath": "/",
    "forgotPasswordUrl": null,
    "signUpUrl": null
  }
}
```

New **core components** (optional split):

| Component | Role |
|-----------|------|
| `AuthLayout` | Page chrome: background, max-width, split panel |
| `SocialLoginButtons` | Renders Google/GitHub buttons from `providers` prop |
| `LoginForm` | Email/password + calls existing login flow |

---

## Phased implementation

### Phase 1 — Visual polish (no new auth methods)

**Goal:** Clerk-like look with email/password only.

| Task | Details |
|------|---------|
| `AuthLayout` | Wrapper: gradient/mesh bg, centered column, optional split left brand panel |
| shadcn additions | `Alert`, `Separator`, optional `Input` icons |
| `LoginForm` UX | Logo slot, divider “Or continue with email”, password toggle, loading spinner on button |
| Errors | shadcn `Alert` destructive variant |
| AuthBar | Move to Tailwind; or hide on login template (already hidden) |
| Seed | Update login spec with new props defaults |

**Validate:** `/login` looks modern; email login still works; `.noname-auth` scoped.

**No server changes.**

---

### Phase 2 — Google (and social) sign-in

**Goal:** “Continue with Google” button; same JWT at the end.

| Area | What we need |
|------|----------------|
| **ZITADEL** | Configure Google IdP on org/project (`pnpm init:zitadel` or console); OAuth client ID/secret in env |
| **Server** | New route e.g. `GET /api/tenants/:orgId/auth/idp/:provider/start` → returns ZITADEL authorize URL for that IdP |
| **Client** | `SocialLoginButtons` → redirect to start URL (or window.location) |
| **Callback** | Re-add **`/auth/callback`** route (browser only) — OAuth return landing; exchange code → JWT; **not** ZITADEL hosted UI |
| **oidc.json** | Keep `redirectUri: .../auth/callback` (already registered) |

Flow:

```
Click "Continue with Google"
  → GET .../auth/idp/google/start?redirectUri=...
  → redirect to Google (via ZITADEL)
  → return to /auth/callback?code=...
  → client or server exchanges code → JWT
  → redirect to /
```

**Note:** Social login **requires a browser redirect** to Google — unlike password, it cannot stay 100% in-form without that OAuth hop. We still avoid ZITADEL’s hosted login **page**; user sees Google’s consent, then returns to **our** callback.

| Task | Owner |
|------|-------|
| ZITADEL Google IdP setup | `init:zitadel` script |
| IdP start + callback broker | server `auth` domain |
| `/auth/callback` page | client (minimal — spinner + handleCallback) |
| `SocialLoginButtons` | core component |
| `providers` prop on LoginForm | schema + seed |

**Validate:** Google sign-in → JWT → Signed in on storefront.

---

### Phase 3 — Account flows

| Feature | Approach |
|---------|----------|
| Forgot password | Link to ZITADEL reset or our wrapper route |
| Sign up / register | ZITADEL register API or invite-only (product decision) |
| MFA challenge | Second step UI when Session API returns MFA required |
| “Remember this device” | Client cookie max-age (already partial) |

---

### Phase 4 — Merchant branding & admin

| Feature | Approach |
|---------|----------|
| Per-org logo, colors | `tenant_settings.auth` + login spec props — see [`ORG-AUTH-CONFIG.md`](./ORG-AUTH-CONFIG.md) |
| Admin: edit login + enable Google/MFA | Phase C **Auth settings** UI (Clerk-like) |
| Custom domain login | Phase D |

---

## What stays in core (not extension)

| Always core | Never in commerce/booking extension |
|-------------|-------------------------------------|
| LoginForm, AuthLayout, SocialLoginButtons | |
| auth/login.ts, session.ts | |
| server auth domain | |
| `/login` template | |

Auth UI is **platform infrastructure**, like navigate — one implementation for all visions.

---

## Dependencies & packages

| Need | Package / tool | Phase |
|------|----------------|-------|
| Tailwind + shadcn | Already in `packages/client` | 1 |
| Icons (Google logo) | `lucide-react` or inline SVG | 2 |
| OAuth callback | Client route + optional server exchange | 2 |
| Google OAuth credentials | Env / ZITADEL IdP config | 2 |
| No Clerk/Auth0 SDK | ZITADEL is IdP — we own UI | — |

**Do not** add Clerk or Auth0 as a second IdP — duplicates ZITADEL.

---

## Risks / decisions to make before Phase 2

| Question | Options |
|----------|---------|
| OAuth callback owner | Client exchanges code (PKCE) vs server broker (like password) |
| Google creds in dev | Real Google Cloud project vs skip social in local dev |
| Sign up | Open registration vs invite-only for merchants |
| MFA | Required for admin role only? |

**Recommendation:** Phase 2 callback via **server broker** (same trust model as password) so PAT/secrets stay off client.

---

## Order vs product roadmap

```
Done     Phase A — email login + JWT ✅
Next     Login UI Phase 1 — visual polish
Then     Login UI Phase 2 — Google
Then     Phase B — commerce (can overlap Phase 1)
Later    Phase C — admin
Later    Login UI Phase 3–4 — MFA, branding
```

---

## Phase 1 checklist (when we implement)

- [ ] `AuthLayout` component + register in core catalog
- [ ] shadcn: `Alert`, `Separator`
- [ ] LoginForm: logo, divider, password toggle, Alert errors
- [ ] Extend `LoginForm` schema props
- [ ] Update login seed spec
- [ ] Visual QA on `{orgId}.localhost:5173/login`

## Phase 2 checklist (when we implement)

- [ ] Google IdP in ZITADEL + `init:zitadel`
- [ ] Server: IdP start + OAuth finalize
- [ ] Client: `/auth/callback` + `SocialLoginButtons`
- [ ] `providers: ["google"]` in login spec
- [ ] E2E: Google → JWT → API calls work

---

## References

- [ZITADEL — Username & password in custom login UI](https://zitadel.com/docs/guides/integrate/login-ui/username-password)
- [ZITADEL — OIDC in custom login UI](https://zitadel.com/docs/guides/integrate/login-ui/oidc-standard)
- [ZITADEL — Identity providers](https://zitadel.com/docs/guides/integrate/identity-providers)
- [`EMBEDDED-LOGIN.md`](./EMBEDDED-LOGIN.md) — password flow today
- [`EXTENSION-LIFECYCLE.md`](./EXTENSION-LIFECYCLE.md) — login stays core
