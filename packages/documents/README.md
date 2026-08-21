# @noname/documents

Cross-runtime CMS **wire types** and **pure helpers** for `@noname/client` and `@noname/server` — same role as `@noname/auth` for auth.

Not a junk drawer — only document ref parsing, schema shapes, and label/locale rules that must stay in sync across runtimes.

Rationale: [`docs/2026-07-31/SHARED-PACKAGES.md`](../../docs/2026-07-31/SHARED-PACKAGES.md).

---

## Add here

- Wire types (`ContentTypeSchema`, `DocumentRef`, …)
- Pure ref parsing (`documentIdFromRef`, `documentIdFromFieldValue`)
- Pure locale/label helpers (`pickLocalizedValue`, `labelFromContentData`)

## Never add

| Do not put here | Use instead |
|---|---|
| DB, storage, Drizzle | `@noname/server` `domains/documents/` |
| HTTP routes, Hono | Server domain |
| React components | `@noname/client` |
| Generic slug/string helpers | `@noname/shared` |
| Auth, JWT | `@noname/auth` |

---

## Current exports

| Module | Contents |
|---|---|
| `schema.ts` | `ContentFieldSchema`, `ContentTypeSchema` |
| `refs.ts` | `DocumentRef`, `documentIdFromRef`, `parseDocumentRef`, `documentIdFromFieldValue` |
| `locale.ts` | `DEFAULT_CONTENT_LOCALE`, `pickLocalizedValue`, `labelFromContentData` |
| `catalog-props.ts` | `catalogProps`, `specProps`, `CatalogProps` — spec-driven-UI props contract |

---

## Dependencies

- `@noname/shared` — `coerceScalarString` only
- No React, Hono, Postgres, or env reads

## Tests

Colocated `*.test.ts` for pure helpers (`refs.test.ts`, …). Run via root `pnpm test`.
Consumer integration tests (server `resolve.test.ts`, client admin) stay in those packages.
