# @noname/shared

Tiny **pure helpers** duplicated across **3+ workspace packages** (client, server, workers, …).

This is **not** a domain layer, **not** a junk drawer, and **not** a place to park code “for later.”

Longer rationale: [`docs/2026-07-31/SHARED-PACKAGES.md`](../../docs/2026-07-31/SHARED-PACKAGES.md).

---

## For AI agents — read before adding anything

### Add here only when **all** are true

1. **3+ packages** already import the same logic (not 2, not server-only).
2. **Pure** — no `process.env`, DB, Redis, Hono, React, Cloudflare `Env`, Node-only APIs.
3. **Stable** — one concern; unlikely to move back into a single domain this sprint.
4. **One file per export** — re-export from `src/index.ts` only.

### Never add (junkyard triggers)

| Do not put here | Use instead |
|---|---|
| Domain types, DTOs, event names | Server `domains/{name}/ports.ts` or future `@noname/{domain}-shared` |
| Auth, JWT, permissions, edit mode | `@noname/auth` |
| CMS labels, locale, ref parsing | `@noname/documents` |
| React components, hooks, actions | `@noname/client` |
| HTTP / `fetch` wrappers | Consumer package or `@noname/auth` |
| Config, env, feature flags | Server domain or `packages/server/src/shared/` |
| “Might be useful someday” | Inline locally; wait for a third consumer |
| Re-exports of server domain code | Import the domain or call HTTP |

**If in doubt → do not add.** Fix duplication locally or defer.

### Checklist before a new export

- [ ] `rg` shows **3+** copy-pasted implementations
- [ ] New file has a top comment: `Used by: @noname/…, @noname/…, @noname/…`
- [ ] No new dependencies in `package.json` (stay dependency-free)
- [ ] Export added to `src/index.ts`
- [ ] Old copies deleted (do not leave a fourth copy)

---

## Current exports

| Export | File | Used by |
|---|---|---|
| `coerceScalarString` | `src/coerce-scalar-string.ts` | `@noname/client`, `@noname/server`, `@noname/workers` |
| `normalizeStoreSlug`, `assertValidStoreSlug`, `storeSlugFromHost` | `src/store-slug.ts` | `@noname/client`, `@noname/server`, `@noname/workers` |

---

## Package rules

- **Zero runtime dependencies** — only `typescript` devDependency (`@noname/documents` may depend on `@noname/shared`).
- **Test pure logic here** — colocated `*.test.ts` next to the module (same as `@noname/auth`). Root `pnpm test` picks up `packages/**/*.test.ts`. Consumer tests are additive, not a substitute.
- **No subpath exports** — single entry `"."` until the surface is large enough to split intentionally.

---

## Related packages

| Package | Role |
|---|---|
| `@noname/shared` | Domain-agnostic pure helpers (slug, string coercion) |
| `@noname/documents` | CMS wire types + ref/label pure helpers |
| `@noname/auth` | Auth permissions + JWT pure helpers |
