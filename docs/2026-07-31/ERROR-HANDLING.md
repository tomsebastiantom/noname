# Error handling convention

> **Date:** 2026-07-31

## Rule

1. **Service / domain layer** — throw typed errors from `shared/domain-error.ts` (`ValidationError`, `NotFoundError`, `UnauthorizedError`, `ConflictError`, `ServiceUnavailableError`, …). Route handlers do not catch these; `app.onError` → `handleDomainError` formats the response once.

2. **HTTP route layer** — use `denyUnless(c, PERMISSIONS.X)` for auth; use `parseBody(schema.safeParse(...), label)` from `shared/parse-body.ts` for Zod. Prefer `ok` / `created` from `shared/respond.ts` instead of ad-hoc `c.json({ error })`.

3. **Adapters (Postgres, ZITADEL, ClickHouse, R2)** — map **expected** client-facing failures to domain errors at the adapter boundary (e.g. ZITADEL 401 → `UnauthorizedError`, duplicate user → `ConflictError`). Unexpected infrastructure failures may throw generic `Error` (become 500).

4. **External OIDC calls** — use timeouts (`fetchWithTimeout` in `@noname/auth` and the edge worker).

## JSON shape

All domain errors serialize to:

```json
{ "error": "human message", "code": "VALIDATION_ERROR", "details": { "field": "email" } }
```

Success responses use `{ "data": … }`. Client `apiFetch` reads `error` or `message`.

## Cross-domain

`shared/domain-error.ts` is the **cross-boundary error contract** — any domain may throw these; HTTP maps them once. Domain-specific types/services cross via `documents/contracts.ts` (or future domain contracts). Do not duplicate error classes per domain.

## Not required yet

- Typed `PersistenceError` for every adapter "insert returned no row" case — acceptable as generic 500 until needed.
