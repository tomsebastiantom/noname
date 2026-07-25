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
| Client → edge | rspack proxy → `localhost:8787` (wrangler) | ✅ no demo env injection in bundler |
| Client PKCE login | `packages/client` | ⚠️ Not wired yet |

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

Open the client at **`http://{ZITADEL_DEMO_ORG_ID}.localhost:5173`** — org id comes from the subdomain, same as production hostname routing. No demo org baked into rspack.

**Fresh DB:** `podman compose down -v && podman compose up -d` then `db:push`, `init:zitadel`, `seed:demo`.

---

## References

- [`docs/2026-07-13/AUTH.md`](../2026-07-13/AUTH.md)
- [`docs/2026-05-23/BUILD_PLAN.md`](../2026-05-23/BUILD_PLAN.md)
