# Embedded Login — Why Server Auth Exists

> **Date:** 2026-07-25  
> **Status:** Implemented  
> **Related:** [`LOGIN-UI.md`](./LOGIN-UI.md), [`AUTH-IDENTITY.md`](./AUTH-IDENTITY.md), [`ARCHITECTURE-MAP.md`](./ARCHITECTURE-MAP.md)

---

## Decision

Merchants and customers sign in on **our** `LoginForm` at `/login`. We do **not** send users to ZITADEL’s hosted login UI for product flows.

Login goes through **our API** (`POST /api/auth/:slug/login`), which calls ZITADEL on the server and returns an OIDC access token (JWT).

---

## Why not login entirely in the browser?

| Approach | Works? | Why |
|----------|--------|-----|
| Redirect to ZITADEL hosted UI | Yes | Violates goal — user leaves our app |
| Password grant in browser (`grant_type=password`) | **No** | ZITADEL [does not support ROPC](https://zitadel.com/docs/apis/openidoauth/grant-types) |
| Session API from browser | **No** | Requires `IAM_LOGIN_CLIENT` PAT — **must never ship to the client** |
| **Our form → our API → ZITADEL Session API** | **Yes** | [ZITADEL custom login UI pattern](https://zitadel.com/docs/guides/integrate/login-ui/username-password) |

ZITADEL still owns users, passwords, and tokens. We never store passwords in Postgres. The server is a **trusted login broker**, not a second IdP.

---

## Request flow

```
Browser (yogastore.localhost:5173/login)
  LoginForm → executeAction("login", { email, password, redirectPath })
  → actions.login → auth/account-flows.ts → POST /api/auth/yogastore/login
      { email, password, codeVerifier, clientId, redirectUri }
           │
           ▼
Edge worker (:8787)  — public route, no JWT required
           │
           ▼
API server  packages/server/src/domains/auth/
  1. Start OIDC auth request (PKCE challenge)
  2. ZITADEL Session API: verify user + password (PAT auth)
  3. Finalize auth request → authorization code
  4. Exchange code + verifier → access_token (JWT)
           │
           ▼
Browser stores JWT (sessionStorage + cookie)
  Later: Authorization: Bearer → edge validates JWT → HMAC → API
```

Everything after login is unchanged: edge JWT validation, HMAC to server, `org_id` from token.

---

## Code layout

| Layer | Path | Role |
|-------|------|------|
| Layout spec | login layout document | Props only (`title`, `redirectPath`, `providers`) — no credentials |
| UI | `core/components/LoginForm.tsx` | Form UI; calls `executeAction("login", …)` — **not** `auth/login.ts` |
| Action | `core/actions/auth.ts` | `login`, `idpLogin`, `logout` — single place to change auth behavior |
| Client auth | `packages/client/src/auth/login.ts` | POST to our API, store token (used by actions only) |
| Client session | `packages/client/src/auth/session.ts` | Token storage, `apiHeaders()` |
| **Server auth** | `packages/server/src/domains/auth/` | ZITADEL Session + OIDC finalize |
| **Auth config (target)** | `tenant_settings.auth` + `GET /api/auth/:slug/config` | Per-org providers from Postgres — see [`ORG-AUTH-CONFIG.md`](./ORG-AUTH-CONFIG.md) |
| **Auth config (scaffold)** | `listEnabledProviders()` env lookup | Dev only — **not** production; replace in Phase A2 |
| Edge | `packages/workers/src/routes/proxy.ts` | Public `POST /api/auth/:slug/login` |
| Secrets | `zitadel_keys/login-client.pat` | Server-only; created by `pnpm init:zitadel` |

See [`CLIENT-ACTIONS.md`](./CLIENT-ACTIONS.md) — one canonical path; do not import `auth/login.ts` from catalog components.

---

## Dev setup (no manual ZITADEL console steps)

```bash
podman compose up -d      # ZITADEL in docker-compose.yml
pnpm init:zitadel         # OIDC app + IAM_LOGIN_CLIENT + login-client.pat
pnpm seed:demo            # publishes login layout spec
```

Default dev user (from `docker-compose.yml` first-instance admin):

- **Email:** `admin@zitadel.localhost`
- **Password:** `NonameAdmin1!`
- **URL:** `http://yogastore.localhost:5173/login`

---

## What still uses ZITADEL UI (non-product)

| Surface | Purpose |
|---------|---------|
| ZITADEL console `:8080/ui/console` | Dev/ops only |

---

## Alternatives considered

| Option | Verdict |
|--------|---------|
| Self-hosted ZITADEL Login v2 (Next.js) | Valid later; separate deployable, not in monorepo yet |
| Password grant | Rejected — not supported by ZITADEL |
| Client-only PKCE redirect to ZITADEL UI | Rejected — shows ZITADEL UI; removed from client |

---

## References

- [ZITADEL — Username & password in custom login UI](https://zitadel.com/docs/guides/integrate/login-ui/username-password)
- [ZITADEL — OIDC in custom login UI](https://zitadel.com/docs/guides/integrate/login-ui/oidc-standard)
- [`packages/server/src/domains/auth/zitadel-client.ts`](../../packages/server/src/domains/auth/zitadel-client.ts)
