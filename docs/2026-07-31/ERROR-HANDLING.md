# Error handling convention

> **Date:** 2026-07-31

## Rule

1. **Service / domain layer** — throw typed errors from `shared/domain-error.ts` (`ValidationError`, `NotFoundError`, `DomainError` subclasses). Route handlers do not catch these; `app.onError` → `handleDomainError` formats the response once.

2. **HTTP route layer** — use `denyUnless(c, PERMISSIONS.X)` for auth; use `parseLimitOffset` / Zod where applicable. Prefer `ok` / `created` / `error` from `shared/respond.ts` instead of ad-hoc `c.json({ error })`.

3. **Adapters (Postgres, ZITADEL, ClickHouse, R2)** — infrastructure failures may throw generic `Error` (become 500). Do not catch and reformat in the adapter; let the central handler respond.

4. **External OIDC calls** — use timeouts (`fetchWithTimeout` in `@noname/auth` and the edge worker).

## Not required yet

- Typed `PersistenceError` for every adapter "insert returned no row" case — acceptable as generic 500 until a shared subclass is needed.
- Migrating every `auth/api.ts` catch block in one pass — migrate opportunistically when touching a route.
