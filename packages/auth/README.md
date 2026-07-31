# @noname/auth

Cross-runtime **auth wire contract** — permissions, JWT/OIDC helpers, edit-mode rules — shared by `@noname/server`, `@noname/workers`, and `@noname/client`.

Not a junk drawer. No ZITADEL SDK wiring, no Hono routes, no React session storage.

Rationale: [`docs/2026-07-31/SHARED-PACKAGES.md`](../../docs/2026-07-31/SHARED-PACKAGES.md).

---

## Add here

- Permission keys and role → permission expansion (`PERMISSIONS`, `ROLE_PERMISSIONS`, `hasPermission`)
- Edit-mode URL check (`?edit=true`)
- Pure JWT decode / claim extraction (no signature verify — callers gate trust)
- OIDC userinfo fetch + role resolution from access tokens
- Shared HTTP timeout helper for outbound `fetch` (OIDC userinfo, edge proxy, client bootstrap)

## Never add

| Do not put here | Use instead |
|---|---|
| Login UI, session storage, `clearSession` | `@noname/client` `auth/` |
| ZITADEL management API, route handlers | `@noname/server` `domains/auth/` |
| CMS types, ref/label helpers | `@noname/documents` |
| Generic slug/string helpers | `@noname/shared` |
| DB, Redis, env-specific config | Server domain or `packages/server/src/shared/` |

---

## Current exports

| Module | Contents |
|---|---|
| `permissions.ts` | `PERMISSIONS`, `PLATFORM_ROLES`, `ROLE_PERMISSIONS`, `hasPermission`, `expandPermissions*`, `canDraft`, `canDraftFromPermissions`, `primaryTeamRole` |
| `edit-mode.ts` | `isEditModeUrl`, `EDIT_MODE_FORBIDDEN_ERROR` |
| `jwt/decode.ts` | `decodeAccessTokenPayload`, `userIdFromAccessToken` |
| `jwt/claims.ts` | `orgIdFromTokenPayload` |
| `jwt/roles.ts` | `rolesFromTokenPayload`, `zitadelProjectRolesClaimKey` |
| `http/request-token.ts` | `accessTokenFromRequest` |
| `fetch-with-timeout.ts` | `fetchWithTimeout`, `DEFAULT_FETCH_TIMEOUT_MS` |
| `oidc/userinfo.ts` | `fetchUserinfo`, `rolesFromUserinfo` |
| `oidc/resolve-auth-context.ts` | `resolveAuthContextFromAccessToken`, `permissionsFromJwt`, `teamRoleFromJwt`, … |

Import everything from `@noname/auth` (single `"."` export).

---

## Consumers

| Package | Typical use |
|---|---|
| `@noname/server` | `denyUnless(c, PERMISSIONS.*)`, JWT context on requests |
| `@noname/workers` | Edge JWT gate, edit-mode check, permission expansion |
| `@noname/client` | `PERMISSIONS` constants, `canDraftFromPermissions` — avoid permission string drift |

---

## Dependencies

- **Zero runtime dependencies** — only `typescript` devDependency
- Uses Web `fetch` / `AbortController` (workers + Node 18+)

## Tests

Colocated `*.test.ts` (`permissions.test.ts`, `jwt/decode.test.ts`, …). Run via root `pnpm test`.

---

## Related packages

| Package | Role |
|---|---|
| `@noname/auth` | Permissions + JWT/OIDC pure helpers |
| `@noname/documents` | CMS wire types + ref/label helpers |
| `@noname/shared` | Domain-agnostic pure helpers |
