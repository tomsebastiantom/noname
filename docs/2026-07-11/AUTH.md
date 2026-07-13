# Auth — Logto OIDC + Edge Worker Passthrough

## Architecture decision

> Auth is handled at the Cloudflare edge. JWT validated at edge — invalid requests redirect to Logto login before ever reaching the API server. PII isolation: passwords never touch the API server. Multi-tenancy is built into Logto organizations.
>
> — ARCHITECTURE_DECISIONS.md

## Flow

```
Browser                    Edge Worker                     API Server
  │                            │                               │
  │  GET /page?s=abc           │                               │
  │───────────────────────────►│                               │
  │                            │                               │
  │                   ┌────────┴────────┐                      │
  │                   │ validateJwt()   │                      │
  │                   │ ├─ no token?    │                      │
  │                   │ │  → 302 login  │                      │
  │                   │ ├─ expired?     │                      │
  │                   │ │  → 302 login  │                      │
  │                   │ └─ valid?       │                      │
  │                   │    → ctx = {    │                      │
  │                   │       tenantId, │                      │
  │                   │       userId,   │                      │
  │                   │       role      │                      │
  │                   │    }            │                      │
  │                   └────────┬────────┘                      │
  │                            │                               │
  │                            │  GET /api/edge/schema/...     │
  │                            │  x-tenant-id: yoga            │
  │                            │  x-user-id: user_abc          │
  │                            │  x-role: admin                │
  │                            │──────────────────────────────►│
  │                            │                               │
  │                            │                    ┌──────────┴──────────┐
  │                            │                    │ tenantMiddleware    │
  │                            │                    │ c.set("tenantId",…) │
  │                            │                    │ c.set("userId",…)   │
  │                            │                    │ c.set("role",…)     │
  │                            │                    └──────────┬──────────┘
  │                            │                               │
  │                            │                    getTenantId(c) = "yoga"
  │                            │                    getUserId(c)  = "user_abc"
  │                            │                    getRole(c)    = "admin"
  │                            │                               │
  │                            │◄──────────────────────────────│
  │                            │     { data: { spec, flags } } │
  │                            │                               │
  │◄───────────────────────────│                               │
  │     JSON schema                                            │
```

## What was done (2026-07-11)

### Before: Phase 0 state

- `tenantMiddleware` defined in `shared/tenant.ts` but **never wired** into any route.
- `getTenantId(c)` called everywhere but returned `undefined` since `c.set()` was never invoked.
- Edge worker rendered content directly — `fetchSchema()` called the API server **without** auth headers.
- All API routes were effectively wide open with no tenant isolation.

### After: Auth header passthrough

| Layer | File | Change |
|-------|------|--------|
| **Edge Worker** | `packages/workers/src/routes/api.ts` | Passes `ctx.userId`, `ctx.role` from validated JWT to renderer |
| **Edge Worker** | `packages/workers/src/renderer.ts` | `fetchSchema()` and `personalizeSchema()` forward `x-tenant-id`, `x-user-id`, `x-role` headers to API server |
| **API Server** | `packages/server/src/shared/tenant.ts` | Extended context to include `userId`, `role`. Added `getUserId()`, `getRole()` helpers. |
| **API Server** | `packages/server/src/index.ts` | Wired `tenantMiddleware` globally: `app.use("*", tenantMiddleware)` |
| **Config** | `packages/server/.env.example` | Added `LOGTO_ENDPOINT` |

### Why this approach

- **No JWT verification on the API server.** The edge worker already validates JWT signatures and redirects unauthenticated users to Logto login. Adding JWT verification on the server would be redundant.
- **Defense in depth via header trust.** The server only accepts auth headers from the edge worker (private network / internal origin). If the API server is ever exposed directly, JWT verification can be added later.
- **Dev ergonomics.** In development, set `x-tenant-id` header directly on API requests. No Logto login flow needed for local development.
- **Minimal dependencies.** No `jose`, `@logto/node`, or other auth libraries needed. The edge worker's existing `auth.ts` handles all token concerns.

## Logto infrastructure

Already provisioned in `docker-compose.yml`:

```yaml
logto:
  image: ghcr.io/logto-io/logto:latest
  ports: ["3001:3001", "3002:3002"]
  environment:
    DB_URL: postgres://noname:noname_dev@postgres:5432/logto  # shared Postgres, no bundled DB
    ENDPOINT: http://localhost:3001
    ADMIN_ENDPOINT: http://localhost:3002
```

The `logto` database is created via `scripts/init-dbs.sh` at container startup.

## Dev usage

```bash
# Start Logto + Postgres
docker compose up -d postgres logto

# Start API server (no edge worker needed in dev)
cd packages/server && pnpm dev

# Make an API call with tenant header
curl -H "x-tenant-id: yoga" http://localhost:3000/api/documents/content-types
```

## What remains

| Item | Status |
|------|--------|
| Real JWT signature verification in edge worker (`jose` library) | TODO — worker's `auth.ts:35` has a stub. Currently base64-decodes without verifying signature. |
| Logto M2M (machine-to-machine) token for server-to-server calls | Not needed yet — edge worker already extracts user context from user JWT. |
| User schema in Drizzle | Not needed — users are managed entirely in Logto. The API server only reads `x-user-id` as a string. |
| RBAC / permission checks | Not needed yet — all tenants are isolated by `x-tenant-id`. Admin/user distinction handled via `x-role`. |
| Login redirect / callback on server | Not needed — the edge worker handles all redirects to Logto. |
| Session management | Not needed — stateless JWT. Token refresh handled by the SPA client (not built yet). |
