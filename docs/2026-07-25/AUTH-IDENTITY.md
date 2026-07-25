# Auth Identity — ZITADEL as Source of Truth

> **Date:** 2026-07-25  
> **Status:** Decision recorded; DB migration pending  
> **Related:** [`docs/2026-07-13/AUTH.md`](../2026-07-13/AUTH.md) (JWT + edge + HMAC flow)

---

## What ZITADEL is intended to do

ZITADEL is the **identity provider (IdP)** for the platform. It owns users, organizations, credentials, MFA, and OIDC tokens. The API server and Postgres **do not** store passwords or issue login sessions.

| Responsibility | Owner |
|----------------|-------|
| User accounts, passwords, MFA, social login | ZITADEL |
| Organizations (one org = one store / tenant) | ZITADEL |
| OIDC login (authorization code + PKCE) | ZITADEL |
| Access tokens (JWT) with `sub`, org, roles | ZITADEL |
| Business data (documents, layouts, flags, …) | Postgres (`tenant_id` + `user_id` as foreign keys to identity) |
| JWT validation at the edge | Cloudflare Worker (`packages/workers`) |
| Trust boundary worker → API | HMAC headers (`x-tenant-id`, `x-user-id`, `x-role`, `x-auth-hmac`) |

**Two auth audiences, one ZITADEL instance:**

1. **Platform users** — store owners / admins (`admin` role within their org)
2. **Store customers** — buyers (`customer` role within the store org)

Login UX is intended to live **inside the json-render storefront** (PKCE against ZITADEL), not as a separate hosted-only app. ZITADEL console remains for ops and org setup.

---

## What we implemented (as of 2026-07-25)

| Piece | Location | Status |
|-------|----------|--------|
| ZITADEL in compose | `docker-compose.yml` | ✅ Self-hosted `:8080`, first-instance bootstrap |
| Machine account | `noname-backend` key in `zitadel_keys` volume | ✅ Management API access |
| OIDC SPA provisioning | `scripts/init-zitadel-oidc.ts`, `pnpm init:zitadel` | ✅ Creates/reuses `noname-dev` project + `noname-client` app; writes `ZITADEL_CLIENT_ID` to `.env` |
| Edge JWT validation | `packages/workers/src/auth.ts` | ✅ `parseJwt` + JWKS; extracts org → `tenantId`, `sub` → `userId` |
| Worker → server HMAC | `packages/workers/src/renderer.ts`, `packages/server/src/shared/tenant.ts` | ✅ Sign + verify |
| Dev bypass (no edge) | `tenant.ts` | ✅ Direct `:3000` with `x-tenant-id` only; HMAC optional, warns |
| Client login / PKCE | `packages/client` | ⚠️ Not wired yet |
| DB `tenant_id` type | Drizzle schemas | ⚠️ Still `uuid` — see decision below |

---

## Identity model (decision)

Use ZITADEL identifiers **directly** everywhere. No mapping table. No platform-generated UUIDs for tenants or users.

| Field | Source (JWT claim) | Example | Storage type |
|-------|------------------|---------|--------------|
| `tenant_id` | `urn:zitadel:iam:org:id` | `"383357959301824520"` | `text` (Postgres), `String` (ClickHouse) |
| `user_id` | `sub` | `"383357959302348808"` | `text` where persisted |
| `role` | `role` (or ZITADEL role claims) | `"admin"` / `"customer"` | `text` |

Edge worker already returns these as strings:

```typescript
// packages/workers/src/auth.ts
tenantId: payload["urn:zitadel:iam:org:id"]
userId:   payload.sub
```

Server context (`getTenantId`, `getUserId`) is already `string`. HMAC payload `tenantId:userId:role` works with numeric-string ids.

---

## Why we chose this (not UUID + mapping)

### Historical mismatch

Early schemas used `tenant_id uuid` as a generic Postgres multi-tenant convention, **before** auth was wired and **before** the Logto → ZITADEL migration (2026-07-13). Demo data used a fake UUID (`00000000-0000-0000-0000-000000000001`) because nothing connected JWT org ids to the database yet.

That was **not** a deliberate “ZITADEL requires UUID” decision — the two layers were designed separately and never reconciled.

### Options considered

| Option | Pros | Cons |
|--------|------|------|
| **A. Keep UUID + `tenants` mapping table** | Auth-provider-agnostic internal id | Extra lookup every request (or KV cache); second source of truth; provisioning step |
| **B. `tenant_id` text = ZITADEL org id** ✅ | Single source of truth; JWT → DB with no translation; simpler seeding and ops | Coupled to ZITADEL id format (acceptable — ZITADEL is the chosen IdP) |

**Chosen: B.** One store = one ZITADEL org = one `tenant_id` in every table and event.

Same for users: **`user_id` = JWT `sub`** wherever we persist actor identity (audit, events, orders, agent tasks).

### Performance

There is **no second JWT** after login. Flow:

1. Browser: PKCE login → **one** ZITADEL access token (JWT)
2. Edge: validate JWT once → HTTP headers + HMAC (not another JWT)
3. Server: verify HMAC; use header values in queries

A mapping table would add an optional **fifth** layer (org id → UUID lookup) on every request. Using org id as `tenant_id` removes that layer entirely.

---

## What still needs to change (implementation backlog)

1. **Migrate** all `tenant_id` columns from `uuid` → `text` in Drizzle schemas (`documents`, `flags`, `machines`, `context`, `agent`, `ai-pipeline`, analytics/ClickHouse).
2. **Replace** demo UUID in `scripts/seed-demo.ts` and `packages/client/src/demo-tenant.ts` with a real ZITADEL org id (from console or `init:zitadel` project output).
3. **Wire client auth** — PKCE login, token storage, `Authorization: Bearer` to edge (or cookie read by edge).
4. **Update** `docs/2026-07-10/documents-domain.md` system column table: `tenant_id` → TEXT, sourced from ZITADEL org.

---

## Dev workflow (today)

```bash
podman compose up -d
pnpm init:zitadel          # OIDC app + ZITADEL_CLIENT_ID in .env
pnpm seed:demo             # layout data (still uses demo UUID until migration)
pnpm dev                   # API :3000
pnpm --filter @noname/client dev   # :5173, x-tenant-id header only
```

Until migration, local dev continues to use the hardcoded demo UUID for tenant scoping. After migration, seed and client should use the ZITADEL org id for the dev store.

---

## References

- Canonical auth flow: [`docs/2026-07-13/AUTH.md`](../2026-07-13/AUTH.md)
- ZITADEL org = store: [`docs/2026-05-23/BUILD_PLAN.md`](../2026-05-23/BUILD_PLAN.md) (ZITADEL Organizations section)
- Vela / Keycloak (Phase 3+, separate from app auth): [`docs/2026-07-04/INFRASTRUCTURE_NEEDS.md`](../2026-07-04/INFRASTRUCTURE_NEEDS.md)
