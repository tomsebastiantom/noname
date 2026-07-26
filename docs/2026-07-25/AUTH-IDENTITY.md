# Auth Identity — ZITADEL as Source of Truth

> **Date:** 2026-07-25  
> **Status:** `org_id` / `user_id` naming aligned with ZITADEL org + JWT `sub`  
> **Related:** [`docs/2026-07-13/AUTH.md`](../2026-07-13/AUTH.md) (JWT + edge + HMAC flow)

---

## What ZITADEL is intended to do

ZITADEL is the **identity provider (IdP)** for the platform. It owns users, organizations, credentials, MFA, and OIDC tokens. The API server and Postgres **do not** store passwords or issue login sessions.

| Responsibility | Owner |
|----------------|-------|
| User accounts, passwords, MFA, social login | ZITADEL |
| Organizations (one org = one store) | ZITADEL |
| OIDC login (authorization code + PKCE) | ZITADEL |
| Access tokens (JWT) with `sub`, org, roles | ZITADEL |
| Business data (documents, layouts, flags, …) | Postgres (`org_id` + `user_id`) |
| JWT validation at the edge | Cloudflare Worker (`packages/workers`) |
| Trust boundary worker → API | HMAC headers (`x-org-id`, `x-user-id`, `x-role`, `x-auth-hmac`) |

---

## Identity model

Use ZITADEL identifiers **directly**. No mapping table.

| Field | JWT claim | Example | Postgres column / header |
|-------|-----------|---------|------------------------|
| **org id** | `urn:zitadel:iam:org:id` | `"383371762538184712"` | `org_id`, `x-org-id`, `getOrgId()` |
| **user id** | `sub` | `"383371762538709000"` | `user_id`, `x-user-id`, `getUserId()` |
| **role** | `role` | `"admin"` / `"customer"` | `x-role`, `getRole()` |

```typescript
// packages/workers/src/auth.ts
orgId:  payload["urn:zitadel:iam:org:id"]
userId: payload.sub
```

HMAC payload: `orgId:userId:role`

**Note:** Document type `tenant_settings` and route `/api/tenants/:id/catalog` keep “tenant” as product language (store). The **column** is `org_id` because the value is the ZITADEL org id.

---

## What we implemented (as of 2026-07-25)

| Piece | Location | Status |
|-------|----------|--------|
| ZITADEL in compose | `docker-compose.yml` | ✅ |
| OIDC SPA | `pnpm init:zitadel` → `.env` | ✅ `ZITADEL_CLIENT_ID`, `ZITADEL_DEMO_ORG_ID` |
| Edge JWT + HMAC | `packages/workers`, `packages/server/src/shared/org.ts` | ✅ |
| DB column | Drizzle `orgId: text("org_id")` | ✅ |
| Client → edge | rspack proxy → `localhost:8787`; **no `x-org-id`** from browser | ✅ |
| Client OIDC config | `pnpm init:zitadel` → `packages/client/public/oidc.json` | ✅ runtime fetch, not bundler |
| Embedded login | `LoginForm`, `POST .../auth/login`, server ZITADEL Session API | ✅ see [EMBEDDED-LOGIN.md](./EMBEDDED-LOGIN.md) |

---

## Roadmap (auth + routing)

> **Updated 2026-07-25:** login branding admin, per-org `auth/config` from Postgres — verified against live API.

| Phase | Scope | Status |
|-------|--------|--------|
| **0** | Infra, `org_id` in DB, seed | ✅ |
| **1** | Edge proxy, JWT + HMAC, public GET | ✅ |
| **2** | Client Bearer to edge | ✅ |
| **Login UI** | shadcn `LoginForm`, server-brokered ZITADEL Session API | ✅ [EMBEDDED-LOGIN.md](./EMBEDDED-LOGIN.md) |
| **3** | Store slug + edge Host → `org_id` | ✅ [`PHASE-3-STORE-SLUG.md`](./PHASE-3-STORE-SLUG.md) |
| **Admin UI** | Shell, content, auth, login branding, pages, layouts, DataTable polish | ✅ [`ADMIN-UI-LATER.md`](./ADMIN-UI-LATER.md) |
| **Account flows** | Forgot password, sign-up, MFA login + TOTP enrollment | ✅ [`ACCOUNT-FLOWS.md`](./ACCOUNT-FLOWS.md) |
| **4** | Custom domains, wrangler in compose | Later |

**Today:** dev URL is `http://yogastore.localhost:5173` (slug → org via `GET /api/tenants/resolve/:slug`). Full edge Host routing: [`PHASE-3-STORE-SLUG.md`](./PHASE-3-STORE-SLUG.md).

---

## Dev workflow

```bash
podman compose up -d
pnpm init:zitadel                    # .env: ZITADEL_DEMO_ORG_ID (for seed script)
pnpm --filter @noname/server db:push # fresh DB only
pnpm seed:demo

pnpm dev                             # API :3000
pnpm --filter @noname/workers dev    # edge :8787 (wrangler)
pnpm --filter @noname/client dev     # :5173 → proxies /api to edge
```

Open the client at **`http://yogastore.localhost:5173`** — store slug in the subdomain resolves to org id, same as production hostname routing. No demo org baked into rspack.

**Sign in:** open **`/login`** → enter email/password → client POSTs to `POST /api/tenants/yogastore/auth/login` → server calls ZITADEL Session API → JWT stored → redirect.

Why the server is in the path: ZITADEL does not support password grant in the browser, and the Session API requires a secret. See [EMBEDDED-LOGIN.md](./EMBEDDED-LOGIN.md).

API calls after login send `Authorization: Bearer` only (no client `x-org-id`); edge resolves org from JWT or URL path and forwards HMAC to the API.

**Fresh DB:** `podman compose down -v && podman compose up -d` then `db:push`, `init:zitadel`, `seed:demo`.

---

## References

- [`docs/2026-07-13/AUTH.md`](../2026-07-13/AUTH.md)
- [`EMBEDDED-LOGIN.md`](./EMBEDDED-LOGIN.md) — why login goes through the API server
- [`docs/2026-05-23/BUILD_PLAN.md`](../2026-05-23/BUILD_PLAN.md)
