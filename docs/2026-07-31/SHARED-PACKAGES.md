# Shared packages — when, why, and current map

> **Date:** 2026-07-31 (updated after `@noname/documents` extraction)  
> **Related:** [`ARCHITECTURE-AUDIT.md`](./ARCHITECTURE-AUDIT.md) · [`packages/shared/README.md`](../../packages/shared/README.md) · [`packages/auth/README.md`](../../packages/auth/README.md) · [`packages/documents/README.md`](../../packages/documents/README.md)

---

## Summary

Three cross-runtime libraries exist today, each with a **different bar**:

| Package | Bar | Consumers |
|---|---|---|
| `@noname/auth` | Auth wire contract — JWT, permissions, edit mode | server, workers, client |
| `@noname/documents` | CMS wire types + pure ref/locale helpers | server, client |
| `@noname/shared` | Domain-agnostic pure helpers (3+ packages) | server, client, workers |

**Server owns behavior.** Shared packages hold **types and pure functions only** — no DB, Hono, React, or env.

Do **not** create `@noname/{domain}-shared` for every domain. Most domains stay in `@noname/server` with HTTP-only clients.

---

## For AI agents — when to update package docs

**Do not** touch README / this file on every commit. Docs track the **public export surface**, not all code changes.

| Change | Update `packages/{pkg}/README.md` + this file? |
|---|---|
| New, renamed, or removed export in `packages/{auth,documents,shared}/src/index.ts` | **Yes** |
| Bug fix or internal refactor; same exports | **No** |
| New consumer of an existing export (e.g. client imports `PERMISSIONS`) | **No** |
| Server/client/workers code that does not add a shared-package export | **No** |

**Example (yes):** export `fetchWithTimeout` from `@noname/auth` → add row to auth README exports + `@noname/auth` table here.

**Example (no):** fix `hasPermission()` inside `permissions.ts` → same export name, no doc churn.

---

## Why `@noname/documents` exists (bar met)

The documents audit flagged drift between client and server:

| Concern | Before | After |
|---|---|---|
| Entry labels | Different fallback rules | `@noname/documents` `labelFromContentData` |
| Locale pick | Client missing default locale | `pickLocalizedValue` shared |
| Schema types | Duplicated in `ports.ts` + client | Wire types in `@noname/documents`; server `ports.ts` re-exports |
| Ref parsing | Copied helpers | `documentIdFromRef`, `parseRef` in package |

**Consumers:** `@noname/server` (shims re-export for backward compat) + `@noname/client` (`content-entries.ts` re-exports).

**Not yet in workers** — no edge CMS parsing today. Revisit when workers need ref/slug rules without API round-trips.

---

## Recommended pattern (all domains)

```
Default
  └── Domain lives in packages/server/src/domains/{domain}/
      api.ts, ports.ts, services/, adapters/

Cross-runtime pure contract (rare)
  └── @noname/{domain}  OR  @noname/auth
      types + pure functions only

Client / workers / extensions
  └── HTTP to server  OR  import shared package when bar is met
```

**Do not** create one mega junk-drawer — use `@noname/shared` only for domain-agnostic helpers.

### Decision checklist

Add a shared package when **all** are true:

1. **Two or more packages** need the same thing (not server alone).
2. **Pure** — no Postgres, Redis, env, or framework imports.
3. **Drift causes bugs** — not merely “duplicate lines.”
4. **API is insufficient** — consumer must compute locally (e.g. JWT on workers).

If any answer is no → keep logic in server domain or use the API.

---

## Domain map (current)

| Domain / concern | Pattern today |
|---|---|
| Auth, permissions, JWT | `@noname/auth` — server, workers, client |
| CMS wire types, refs, labels | `@noname/documents` — server + client |
| Generic pure helpers (slug, coerce) | `@noname/shared` — server + client + workers |
| Extension UI + catalog | `@noname/extensions` — client MF bundle |
| Browser telemetry | `@noname/browser-sdk` — client only |
| Flags, analytics, machines, tenant, agent | Server only; admin UI via HTTP |
| Cross-domain server helpers | `packages/server/src/shared/` (not an npm package) |

---

## `@noname/shared`

**Added:** 2026-07-31 — replaces triplicated `coerceScalarString`; adds `storeSlug` helpers.

**Canonical agent instructions:** [`packages/shared/README.md`](../../packages/shared/README.md)

| Export | Consumers |
|---|---|
| `coerceScalarString` | client, server (ClickHouse), workers (JWKS) |
| `normalizeStoreSlug`, `assertValidStoreSlug`, `storeSlugFromHost` | client, server, workers |

### For AI agents — what belongs in `@noname/shared`

**Add only when all are true:**

1. **3+ workspace packages** import the same logic.
2. **Pure function** — no env, DB, Hono, React, Cloudflare bindings.
3. **Stable** — unlikely to move back into a domain within one sprint.
4. **Small** — one concern per file.

**Never add to `@noname/shared`:**

| Do not add | Put it instead |
|---|---|
| Domain types, DTOs, event names | Server `ports.ts` or `@noname/documents` / future domain package |
| Auth, JWT, permissions | `@noname/auth` |
| CMS labels, locale, ref parsing | `@noname/documents` |
| React components or hooks | `@noname/client` |
| HTTP clients, `fetch` wrappers | Consumer package or `@noname/auth` |
| Config, env readers | Server domain or `packages/server/src/shared/` |

**Before adding a new export:** grep for duplicates. Two copies → fix drift locally or defer.

---

## `@noname/auth`

**Canonical agent instructions:** [`packages/auth/README.md`](../../packages/auth/README.md)

| Export | Consumers |
|---|---|
| `PERMISSIONS`, `hasPermission`, `canDraftFromPermissions` | server, workers, client |
| `fetchWithTimeout`, `DEFAULT_FETCH_TIMEOUT_MS` | auth (OIDC), workers (proxy/JWKS), client (catalog bootstrap) |
| JWT decode / OIDC context helpers | server, workers |

---

## `@noname/documents`

**Location:** `packages/documents/` (sibling to `shared/`, `auth/` — not nested inside `shared/`)

**Exports:**

| Module | Contents |
|---|---|
| `schema.ts` | Wire `ContentTypeSchema`, field types |
| `refs.ts` | Ref parsing, `documentIdFromRef` |
| `locale.ts` | `pickLocalizedValue`, `labelFromContentData` |

**Server shims** (keep server-only extensions):

- `domains/documents/refs/parse.ts` → re-exports from package
- `domains/documents/shared/locale.ts` → re-exports + `resolveTenantLocales` (server-only)
- `domains/documents/ports.ts` → imports wire types from package; `FieldDefinition` aliased to `ContentFieldSchema`

**Client:** `admin/content-entries.ts` re-exports `entryLabel`, `documentIdFromFieldValue`.

---

## When to add another domain package

Create `@noname/{domain}` only when a **third runtime** needs the same pure logic and HTTP is not enough — same bar as auth and documents.

Candidates to watch (not yet):

| Domain | Trigger |
|---|---|
| flags | Workers evaluate flags locally at edge |
| analytics | Shared event name constants across SDK + server |

Until then: **API-first**, server modules for behavior.
