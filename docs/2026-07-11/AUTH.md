# Auth — ZITADEL OIDC + Edge Worker Passthrough + HMAC

> **Superseded doc note:** This file was originally written for Logto (2026-07-11).
> Auth migrated to ZITADEL on 2026-07-13 with HMAC hardening on 2026-07-18.
> **Canonical reference:** [`docs/2026-07-13/AUTH.md`](../2026-07-13/AUTH.md)

## Summary

Auth runs at the Cloudflare edge, not in the API server:

1. Browser authenticates with **ZITADEL** (authorization code + PKCE) → access token
2. Edge worker validates JWT via `@cfworker/jwt` (signature, issuer, expiry, JWKS)
3. Worker extracts `sub` → userId, org claim → tenantId, `role` → role
4. Worker signs headers with **HMAC-SHA256** (`WORKER_SERVER_SECRET`)
5. Server middleware verifies HMAC and sets tenant/user/role on context

In local dev without the edge worker, the client rspack proxy talks directly to the
API server. Missing HMAC logs a warning; requests are not blocked.

## Quick reference

| Resource | URL / detail |
|----------|--------------|
| ZITADEL Console | `http://localhost:8080/ui/console` |
| Admin login | `admin` / `NonameAdmin1!` (dev only) |
| OIDC Discovery | `http://localhost:8080/.well-known/openid-configuration` |
| Worker issuer var | `ZITADEL_ISSUER=http://localhost:8080` (`wrangler.toml`) |
| Shared secret | `WORKER_SERVER_SECRET` — must match worker `.dev.vars` and server `.env` |

## What remains

| Item | Status |
|------|--------|
| JWT signature verification | ✅ `@cfworker/jwt` + JWKS |
| HMAC worker→server | ✅ Implemented |
| ZITADEL Docker auto-setup | ✅ `docker-compose.yml` |
| OIDC client app (browser) | ⚠️ Create manually in ZITADEL console |
| SPA login / token refresh | ⚠️ Not wired in client yet |
| Production hardening | ⚠️ Rotate secrets, enable TLS |

See [`docs/2026-07-13/AUTH.md`](../2026-07-13/AUTH.md) for full architecture, flow diagrams, and configuration.
