# Document References — Unified Pointer Model

> **Date:** 2026-07-25  
> **Status:** ✅ Implemented (server + client + seed)  
> **Related:** [`documents-domain.md`](../2026-07-10/documents-domain.md), [`ORG-AUTH-CONFIG.md`](./ORG-AUTH-CONFIG.md), [`CONTENT-RENDER-PIPELINE.md`](./CONTENT-RENDER-PIPELINE.md), [`ARCHITECTURE-MAP.md`](./ARCHITECTURE-MAP.md)

---

## Summary

Every cross-document pointer in the platform uses **one stored shape**:

```jsonc
{ "documentId": "<uuid-of-row-in-documents-table>" }
```

Meaning is **not** stored in the ref. It comes from **where the ref lives**:

| Context | How we know what it points to |
|---------|-------------------------------|
| Content field `type: "media"` | Must resolve to a row with `type === "asset"` |
| Content field `type: "reference"`, `references: "product"` | Must resolve to a row with `type === "product"` |
| `tenant_settings.seo.ogImage` | Code-defined: media ref → asset row |
| `tenant_settings.auth.providerIconAssets` | Code-defined: media ref → asset row; URLs resolved at read time on `GET /auth/config` |

**Resolution by id is the right model.** We do not embed entry content, URLs, or type names inside the stored ref. We store a stable row id; validation and UI use schema (or code-defined config) to interpret it.

---

## Why id-only refs (not inline content)

| Approach | Problem |
|----------|---------|
| Store `{ assetId }` vs `{ entryId }` | Two shapes for the same thing (row id in `documents`) |
| Store `{ type, id }` in every ref | Redundant — field schema already declares target type |
| Store resolved URLs in content | Stale when asset moves, variant changes, or CDN base URL changes |
| Store copied entry JSON | Duplicated data; source entry updates do not propagate |

**Correct split:**

```
Stored (write path)     →  { documentId }
Validated (save)        →  row exists, same orgId, type matches schema
Resolved (read/render)  →  join id → asset URLs, entry labels, nested content (when needed)
```

Admin UI and API save paths only need the pointer. Storefront/edge resolve when serving.

---

## What we implemented (2026-07-25)

### Canonical type

`packages/server/src/domains/documents/refs.ts`:

- `DocumentRef { documentId: string }`
- Aliases: `MediaRef`, `ContentEntryRef` (same shape)
- `documentIdFromRef()` / `parseDocumentRef()` — read canonical or **legacy** keys (`assetId`, `entryId`, bare string) for migration

### Validation on save

`assertDocumentRefs()` in documents service, on content create/update:

1. Parse `documentId` from field value
2. `findDocumentById(documentId)`
3. Fail if missing or wrong `orgId`
4. Fail if `found.type !== expectedType` (`asset` for media; `field.references` for reference fields)

Schema registration also requires `reference` fields to declare `references` (target content type name).

### Asset API

Asset CRUD and `assets.get(orgId, documentId)` use **row id** (`findDocumentById`), not document `key`.

### Auth + tenant config

- `providerIconAssets`: `Record<string, MediaRef>` — stored refs, not URLs
- `GET /auth/config`: `providerIcons` — URLs resolved at read time via `resolveProviderIconUrls()`
- Custom IdPs: `auth_provider.icon` media field → publish sync → `tenant_settings.auth`

### Client admin

- `MediaFieldInput` — upload/pick asset → saves `{ documentId }`
- `ReferenceFieldInput` — lists entries of `field.references` type → saves `{ documentId }`
- Both accept legacy stored shapes when loading existing entries

### Seed

Built-in IdP icons linked with `{ documentId: asset.id }` (row id, not `key`).

### Tests

`refs.test.ts`, `asset-url.test.ts`, `auth-provider-content.test.ts` — typecheck + vitest green.

---

## Schema-driven UI (no extra flags on stored ref)

Merchants do not pick “what kind of ref” in the UI. The **content type schema** drives behavior:

```jsonc
{ "key": "category", "type": "reference", "references": "category", "label": "Category" }
{ "key": "hero",     "type": "media",      "label": "Hero image" }
```

| Field type | Admin UI | Stored value |
|------------|----------|--------------|
| `reference` + `references: "product"` | List/pick from `/api/documents/product` | `{ documentId }` |
| `media` | Upload or asset library | `{ documentId }` → asset row |

No `kind` or `targetType` flag on the JSON blob — the field definition is the flag.

---

## Read-time resolution (when we join id → useful data)

Not every code path resolves refs. That is intentional:

| Consumer | Resolves refs? | Notes |
|----------|----------------|-------|
| Content save | Validates existence + type only | No URL expansion |
| `GET /auth/config` | Yes — `providerIcons` | Public login needs image URLs |
| Edge `$state` / render pipeline | Yes — media → variant URLs | See CONTENT-RENDER-PIPELINE |
| Admin entry list | Partial — labels from entry data | Reference picker loads target list by type |
| Raw `GET /api/documents/:type/:id` | No — returns stored `{ documentId }` | Callers resolve if needed |

**Rule:** resolve at the boundary that needs enriched data (storefront, auth config, prerender), not on every write.

---

## Future work (same pointer model — no storage change)

These build on `{ documentId }` without changing the stored shape.

### 1. Published-only refs (optional constraint)

**Goal:** Reference fields may only point at `status === "published"` entries (configurable per field or globally).

**Where:** Extend `checkDocumentRef()` — after type check, optionally verify status.

**Schema hook (future):** `constraints: { publishedOnly: true }` on reference fields.

**Does not change:** stored `{ documentId }`.

---

### 2. Cascade / delete warnings

**Goal:** Before archiving/deleting a document, report inbound refs (“3 products reference this category”).

**How:**

- Query: scan `documents.data` JSONB for matching `documentId` values (or maintain a reverse index later if scan is too slow)
- Admin: show warning dialog with list of dependents
- Policy options: block delete, allow with broken ref, or auto-clear ref (merchant choice)

**Does not change:** stored `{ documentId }`.

---

### 3. Resolve API (ref → label / preview for storefront)

**Goal:** Edge or client needs human-readable labels without N+1 fetches.

**Example:**

```
GET /api/documents/resolve-refs?ids=uuid1,uuid2&locale=en-US
→ { "uuid1": { "type": "product", "label": "Blue Sneakers", "url": "..." }, ... }
```

**Uses:** category breadcrumbs, related products, cart line display, admin previews.

**Implementation sketch:**

- Batch `findDocumentById` for ids
- For content types: pick title field from content type schema
- For assets: return variant URL + altText
- Cache by `{orgId}:{documentId}:{locale}` at edge

**Does not change:** stored `{ documentId }`.

---

### 4. Rich text embedded refs

`documents-domain.md` describes `embedded-entry-block` / `embedded-asset-block` in rich text. Same rule: store document ids inside the Lexical (or equivalent) node JSON; resolve blocks at render time.

---

## Migration note (legacy keys)

Existing rows may still contain:

```jsonc
{ "assetId": "..." }
{ "entryId": "..." }
"bare-uuid-string"
```

Readers accept these; **new writes** use `{ documentId }` only. Re-seed or re-save entries to normalize over time. No one-time migration required for dev.

---

## Decision checklist (for new features)

When adding a field or config that points at another document:

1. **Store** `{ documentId }` only
2. **Declare intent** in schema (`media` / `reference` + `references`) or in typed config (e.g. `MediaRef` on `TenantSeoConfig`)
3. **Validate** on write: exists, org, type match (+ published later if needed)
4. **Resolve** on read only where the consumer needs URLs, labels, or nested content
5. **Do not** duplicate type name or resolved payload in the stored ref

---

## Files (implementation map)

| Area | Path |
|------|------|
| Ref types + parse | `packages/server/src/domains/documents/refs.ts` |
| Save validation | `packages/server/src/domains/documents/service.ts` (`assertDocumentRefs`) |
| Zod accept legacy + canonical | `packages/server/src/domains/documents/validator.ts` |
| Postgres normalize on read | `packages/server/src/domains/documents/adapters/postgres.ts` |
| Auth icon resolve | `packages/server/src/domains/auth/asset-url.ts`, `auth-config.ts` |
| Admin media picker | `packages/client/src/core/components/MediaFieldInput.tsx` |
| Admin reference picker | `packages/client/src/core/components/ReferenceFieldInput.tsx` |
| Save payload | `packages/client/src/admin/content-entries.ts` |

---

## Related docs to update over time

- [`documents-domain.md`](../2026-07-10/documents-domain.md) — still shows legacy `assetId` in examples; treat **this doc** as source of truth for ref shape until that file is refreshed
- [`ORG-AUTH-CONFIG.md`](./ORG-AUTH-CONFIG.md) — provider icon assets follow `MediaRef` pattern described here
