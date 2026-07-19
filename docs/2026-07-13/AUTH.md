# Auth — ZITADEL OIDC + Edge Worker Passthrough + HMAC

## Architecture

```
Browser ──► Edge Worker (:8787) ──► Server (:3000) ──► Infra
  │              │                                            │
  │              ├── parseJwt(token, issuer, getKey)          │
  │              │     ├── sig verification (@cfworker/jwt)   │
  │              │     ├── issuer validation                  │
  │              │     ├── expiry check                       │
  │              │     └── JWKS via OIDC discovery (cached)   │
  │              │                                            │
  │              ├── extract sub → userId                     │
  │              ├── extract org → tenantId                   │
  │              │                                            │
  │              ├── HMAC-SHA256(tenantId:userId:role)        │
  │              │     key: WORKER_SERVER_SECRET              │
  │              │                                            │
  │              └── forward: x-tenant-id, x-user-id,         │
  │                     x-role, x-auth-hmac                   │
  │                                                           │
  └── ZITADEL (:8080) ────────────────────────────────────────┘
        auto-configured via ZITADEL_FIRSTINSTANCE_* env vars
```

## Flow

1. Client authenticates with ZITADEL (authorization code + PKCE) → gets access token
2. Client sends `Authorization: Bearer <token>` to edge worker
3. Worker calls `parseJwt` from `@cfworker/jwt` with `getKey` resolver:
   - Discovers JWKS URI from `{issuer}/.well-known/openid-configuration`
   - Fetches and imports the JWKS key by `kid`
   - Validates RSA signature, issuer (`ZITADEL_ISSUER`), expiry
4. Worker extracts identity: `sub` → userId, org claim → tenantId, `role` → role
5. Worker computes `HMAC-SHA256(tenantId:userId:role)` with `WORKER_SERVER_SECRET`
6. Worker forwards headers to server: `x-tenant-id`, `x-user-id`, `x-role`, `x-auth-hmac`
7. Server middleware (`tenant.ts`):
   - If `x-auth-hmac` present: verifies HMAC with `crypto.timingSafeEqual`
   - If `x-auth-hmac` absent AND secret configured: logs warning (dev mode, no edge worker)
   - If `x-auth-hmac` absent AND no secret: pass through (dev without edge worker)
   - `/health` endpoint: always skip HMAC
8. Domain code uses `getTenantId(c)`, `getUserId(c)`, `getRole(c)` from context

## Defense in Depth

| Layer | File | Mechanism | Attack it blocks |
|---|---|---|---|
| **Worker** | `auth.ts` | `parseJwt` + `getKey` sig verification | Forged tokens |
| **Worker** | `auth.ts` | Issuer validation | Cross-issuer token replay |
| **Worker** | `auth.ts` | Expiry + skew check | Expired token reuse |
| **Worker** | `renderer.ts` | `crypto.subtle.sign` HMAC-SHA256 | — (signs for server trust) |
| **Server** | `tenant.ts` | `createHmac` + `timingSafeEqual` | Direct server access bypassing edge |
| **Server** | `tenant.ts` | `timingSafeEqual` (not `===`) | Timing side-channel attacks |

## Configuration

### Worker (`packages/workers/`)

**`wrangler.toml`** (checked in, non-sensitive):
```toml
[vars]
API_ORIGIN = "http://localhost:3000"
ZITADEL_ISSUER = "http://localhost:8080"
```

**`.dev.vars`** (NOT checked in, secrets only):
```
WORKER_SERVER_SECRET=MpafgdbDKihG1zkRl7onvjBFcPyJLtmH
```

For production, set via `wrangler secret put WORKER_SERVER_SECRET`.

### Server (`packages/server/`)

**`.env`** (NOT checked in):
```
WORKER_SERVER_SECRET=MpafgdbDKihG1zkRl7onvjBFcPyJLtmH
```

### ZITADEL (auto-configured via `docker-compose.yml`)

```yaml
ZITADEL_FIRSTINSTANCE_ORG_HUMAN_USERNAME: admin
ZITADEL_FIRSTINSTANCE_ORG_HUMAN_PASSWORD: NonameAdmin1!
ZITADEL_FIRSTINSTANCE_ORG_HUMAN_PASSWORDCHANGEREQUIRED: "false"
ZITADEL_FIRSTINSTANCE_ORG_MACHINE_MACHINE_USERNAME: noname-backend
ZITADEL_FIRSTINSTANCE_ORG_MACHINE_MACHINEKEY_TYPE: "1"
ZITADEL_FIRSTINSTANCE_MACHINEKEYPATH: /output/noname-backend-sa.json
```

## Dev Mode Behavior

When running locally without the edge worker (client proxies directly to server via rspack proxy):
- Server has `WORKER_SERVER_SECRET` set
- No `x-auth-hmac` header on requests
- Server logs a warning: `"No HMAC on request — may bypass edge worker"`
- Request proceeds normally (not blocked)
- This allows local `pnpm dev` with client→server proxy to work without the edge worker

## Credentials

| Resource | Detail |
|---|---|
| ZITADEL Console | `http://localhost:8080/ui/console` |
| Admin login | `admin` / `NonameAdmin1!` |
| OIDC Discovery | `http://localhost:8080/.well-known/openid-configuration` |
| Machine account | `noname-backend`, key in `zitadel_keys` volume |
| Worker-Server Secret | `MpafgdbDKihG1zkRl7onvjBFcPyJLtmH` (dev only, rotate for prod) |

## Status

| Item | Status |
|---|---|
| JWT signature verification | ✅ `parseJwt` + `getKey` from `@cfworker/jwt` v6 |
| JWKS caching | ✅ OIDC discovery + in-memory cache in `@cfworker/jwt` |
| HMAC worker→server signing | ✅ `renderer.ts` — `crypto.subtle.sign` |
| HMAC server verification | ✅ `tenant.ts` — `createHmac` + `timingSafeEqual` |
| Dev mode (no edge worker) | ✅ HMAC optional, logs warning when missing |
| ZITADEL auto-setup | ✅ `docker-compose.yml` — `ZITADEL_FIRSTINSTANCE_*` env vars |
| Machine account | ✅ `noname-backend` — key in `zitadel_keys` volume |
| OIDC client app (for browser) | ⚠️ Create via ZITADEL console (`:8080/ui/console`) |
| Production hardening | ⚠️ Rotate masterkey + secrets, enable TLS |
