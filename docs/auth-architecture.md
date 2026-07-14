# Auth Architecture

## Pattern: Edge Worker as Auth Gateway

```
Browser ──► Edge Worker (:8787) ──► Server (:3000) ──► Infra
                 │                                           │
                 └── ZITADEL (:8080) ────────────────────────┘
```

The edge worker (`packages/workers/`) validates tokens from ZITADEL, extracts identity claims, and forwards them as plain headers (`x-tenant-id`, `x-user-id`, `x-role`) to the server. The server trusts these headers unconditionally — it never validates tokens itself.

## Current State

**Working:**
- ZITADEL is auto-configured via `docker-compose.yml` env vars (`ZITADEL_FIRSTINSTANCE_*`)
  - Admin: `admin` / `NonameAdmin1!`
  - Console: `http://localhost:8080/ui/console`
  - OIDC Discovery: `http://localhost:8080/.well-known/openid-configuration`
- Edge worker reads JWTs, decodes payload, checks expiry, validates issuer
- Server reads forwarded headers, routes by tenant

**Incomplete:**

### 1. No JWT signature verification
`packages/workers/src/auth.ts:74` — `decodeJwtPayload` only base64-decodes the payload. JWT signatures are never verified. Anyone can forge a token.

```ts
// Current: insecure
function decodeJwtPayload(token: string): JwtPayload {
  return JSON.parse(atob(token.split(".")[1]));
}
```

**Fix:** Add real JWT verification using `@cfworker/jwt` or `jose`:
```ts
import { jwtVerify, importSPKI } from "jose";

// Fetch JWKS, find key by kid, import SPKI, verify
const { payload } = await jwtVerify(token, publicKey, {
  issuer: env.ZITADEL_ISSUER,
  algorithms: ["RS256"],
});
```

`@cfworker/jwt` is preferred for Cloudflare Workers (no Node.js dependencies, works at the edge).

### 2. No defense in depth at the server
`packages/server/src/shared/tenant.ts:16` — the server reads headers without any validation. If the server is ever directly reachable (e.g., firewall misconfig), any request with `x-tenant-id: another-org` is accepted.

**Fix:** Add a shared secret HMAC between worker and server:
1. Worker signs forwarded headers with `HMAC-SHA256` using `WORKER_SERVER_SECRET`
2. Server verifies the HMAC before trusting headers
3. Set `WORKER_SERVER_SECRET` as an env var in both `wrangler.toml` and server `.env`

Or bind the server to `127.0.0.1` only (already done: `:3000` listens on localhost).

### 3. No project/application created (first-time setup)
ZITADEL creates the instance, org, admin, and machine account automatically. But no OIDC application exists yet for the client to use.

**Fix:** One-time manual setup at `http://localhost:8080/ui/console`:
1. Log in as `admin` / `NonameAdmin1!`
2. Create Project → "Noname"
3. Create Application → "SPA" (PKCE) for the client
4. Copy client ID → `wrangler.toml` env vars

## Environment Variables

| Variable | Where | Value |
|---|---|---|
| `ZITADEL_ISSUER` | `wrangler.toml` | `http://localhost:8080` |
| `ZITADEL_ISSUER` | server `.env` | Only needed if server does machine-to-machine calls |

## Completion Checklist

- [ ] Add JWT signature verification in worker (`auth.ts`)
- [ ] Create ZITADEL project + OIDC application (console, one-time)
- [ ] Add server-side header HMAC validation (optional hardening)
- [ ] Add CSRF protection headers
