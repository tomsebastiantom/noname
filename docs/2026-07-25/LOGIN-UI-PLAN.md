# Login UI — Component Plan (first)

> **Date:** 2026-07-25  
> **Status:** Planned — **start here next** (before admin dashboard)  
> **Related:** [`AUTH-IDENTITY.md`](./AUTH-IDENTITY.md), [`ADMIN-UI-LATER.md`](./ADMIN-UI-LATER.md), [`BUILD_PLAN.md`](../2026-05-23/BUILD_PLAN.md)

---

## Priority order (correct)

| Order | What | When |
|-------|------|------|
| **1** | **Login UI** — our screen, ZITADEL API behind it | **Next** |
| 2 | Store slug + Host lookup | Phase 3 (doc only for now) |
| 3 | **Admin UI** — shell, load/manage layouts, lists | **Last** (see [`ADMIN-UI-LATER.md`](./ADMIN-UI-LATER.md)) |
| **4** | Visual editor (`?edit=true`), tenant MF remotes | After admin shell |
| **Client catalog layers** | Core vs extensions (commerce = demo) | [`CLIENT-CATALOG-LAYERS.md`](./CLIENT-CATALOG-LAYERS.md), [`EXTENSIONS.md`](./EXTENSIONS.md) |

**Login is not admin.** Login is the merchant/customer sign-in surface. The dashboard for loading and managing store content comes later.

---

## Goal (login only)

- **Our login page** — shadcn `LoginForm` (email/password, magic link later)
- **ZITADEL = IdP only** — issues JWT; no redirect to `localhost:8080/ui/v2/login`
- **Same client bundle** — json-render layout template `login` (or `admin_login`)
- **Edge unchanged** — Bearer JWT → validate → HMAC → API

Phase 2 PKCE **redirect** was dev plumbing to prove tokens work. Product path = **embedded login component**.

---

## Client layers — what does what (no drift)

The client is a **spec runtime**, not a traditional fat SPA. Keep layers separate:

```
┌─────────────────────────────────────────────────────────┐
│ bootstrap (main.tsx) — THIN                             │
│  • path → which layout spec to fetch                      │
│  • fetch spec + catalog manifest                          │
│  • attach Bearer on /api fetch (from stored token)        │
│  • <Renderer spec={...} registry={...} />                 │
│  Does NOT: build login UI, cart logic, admin chrome       │
└─────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────┐
│ spec (from API / Postgres) — DATA                         │
│  • which components, props, tree                          │
│  • login page, storefront, admin — all specs              │
└─────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────┐
│ catalog + registry — CAPABILITIES                         │
│  • components: LoginForm, Hero, … (render only)           │
│  • actions: login, addToCart, navigate (side effects)     │
└─────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────┐
│ auth/ (pkce.ts, config.ts) — INFRA used by actions      │
│  • token exchange, storage, apiHeaders()                  │
│  • NOT in spec JSON; NOT duplicated per component         │
└─────────────────────────────────────────────────────────┘
```

| Layer | Auth-related? | Example |
|-------|---------------|---------|
| **Spec** | Defines *that* login shows, props (title) | `{ "type": "LoginForm", "props": { "title": "…" } }` |
| **LoginForm component** | UI only — inputs, validation display | shadcn Card; calls `executeAction("login", { email, password })` |
| **registry.actions.login** | **Yes — side effect lives here** | calls `auth/login.ts` → ZITADEL → store token → navigate |
| **auth/pkce.ts** | **Yes — shared implementation** | PKCE/token helpers (one module, not per-page) |
| **main.tsx** | Minimal — Bearer on fetch, route → spec | Remove hardcoded AuthBar over time → `/login` spec |

Same pattern as cart today: `Button` emits → `actions.addToCart` in `registry.ts` → `fetch("/api/...")`.

**Rule:** catalog components stay dumb; **client JS logic for auth goes in `registry.actions` + `auth/`**, not in spec JSON and not bloating `main.tsx`.

---

## What we build first

### 1. shadcn + `LoginForm` component

Minimal platform catalog addition in `packages/client`:

| Component | Purpose | shadcn |
|-----------|---------|--------|
| `LoginForm` | Sign in / register entry | `Card`, `Input`, `Label`, `Button` |
| `AuthLayout` | Centered card on neutral background (optional wrapper) | `Card` |

No sidebar, no `AdminShell`, no data tables yet — those are **admin**, later.

### 2. Login layout document

Seed a simple layout spec (documents domain, type `layout`, key `login`):

```json
{
  "root": "page",
  "elements": {
    "page": {
      "type": "Stack",
      "props": { "direction": "column", "align": "center", "gap": 24 },
      "children": ["form"]
    },
    "form": { "type": "LoginForm", "props": { "title": "Sign in to your store" } }
  }
}
```

| Template | Route (dev) | Auth |
|----------|-------------|------|
| `store` | `{orgId}.localhost:5173` | public ✅ today |
| `login` | `{orgId}.localhost:5173/login` | public → returns JWT |

### 3. Token flow (embedded login — no redirect to ZITADEL hosted UI)

ZITADEL does **not** support password grant (ROPC). Embedded login uses the **Session API** on the server:

```
LoginForm submit
  → POST /api/tenants/{orgId}/auth/login  (PKCE verifier + email/password)
  → Server: ZITADEL Session API + OIDC finalize → access_token
  → sessionStorage + cookie
  → redirect to /
```

`pnpm init:zitadel` grants `IAM_LOGIN_CLIENT` to the machine user and writes `zitadel_keys/login-client.pat`.

**Dev credentials:** `admin@zitadel.localhost` / `NonameAdmin1!` (from `docker-compose.yml` first-instance admin).

`redirectUri` in `oidc.json` is an OIDC protocol identifier (registered in ZITADEL, e.g. `http://localhost:5173/auth/callback`). The browser never opens it during embedded login — the server parses the auth code from that URL string.

---

## How login page loads (same pipeline as storefront)

```
GET {orgId}.localhost:5173/login
  → client fetches /api/edge/schema/{orgId}?template=login  (or segment/key TBD)
  → client fetches /api/tenants/{orgId}/catalog  (platform only for now)
  → json-render renders LoginForm from spec
```

No extra page-specific JS needed for login — platform catalog only. Module Federation is for **later** (custom tenant components on admin/store pages).

---

## Already in place

| Piece | Status |
|-------|--------|
| json-render `Renderer` | ✅ |
| Edge JWT + HMAC | ✅ |
| PKCE + Bearer (redirect dev hack) | ✅ replace with LoginForm |
| `oidc.json` + `init:zitadel` | ✅ |
| shadcn / Tailwind | ❌ first code task |
| `login` layout seed | ❌ |
| `/login` route in client | ❌ |

---

## Implementation checklist (login only)

- [x] `LoginForm` in catalog + registry (styled form; shadcn later)
- [x] Client route `/login` → fetch login layout spec
- [x] Wire form → server `POST .../auth/login` → ZITADEL Session API (`auth/login.ts`)
- [x] Replace storefront ZITADEL redirect Sign in → link to `/login`
- [x] Seed demo `login` layout document
- [x] Server/edge: `?template=login` on schema route
- [x] Server auth domain + `IAM_LOGIN_CLIENT` PAT (`pnpm init:zitadel`)
- [ ] Tailwind + shadcn in `packages/client`

---

## What comes later (not login)

See [`ADMIN-UI-LATER.md`](./ADMIN-UI-LATER.md):

- `AdminShell`, nav, data tables
- Load/manage layouts, products, settings
- `?edit=true` visual editor
- Tenant MF remotes for custom admin widgets

---

## References

- [`docs/2026-05-23/BUILD_PLAN.md`](../2026-05-23/BUILD_PLAN.md) — embed login in our UI; ZITADEL provides API
- [`docs/2026-07-25/AUTH-IDENTITY.md`](./AUTH-IDENTITY.md) — JWT + edge flow
- Code: `packages/client/src/auth/pkce.ts` (to refactor), `main.tsx`, `catalog.ts`
