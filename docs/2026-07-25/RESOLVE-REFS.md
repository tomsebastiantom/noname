# Resolve Document Refs API

> **Date:** 2026-07-25  
> **Status:** ✅ Implemented  
> **Related:** [`DOCUMENT-REFS.md`](./DOCUMENT-REFS.md), [`documents-domain.md`](../2026-07-10/documents-domain.md), [`CONTENT-RENDER-PIPELINE.md`](./CONTENT-RENDER-PIPELINE.md)

---

## Purpose

Stored content keeps **pointers only** — `{ documentId }`. Storefront and admin UIs often need **labels and preview URLs** without loading full entries or running N+1 fetches.

The resolve API batch-loads document rows by id and returns a compact display shape per id.

**Write path:** still `{ documentId }` only.  
**Read path:** call resolve when rendering breadcrumbs, cart lines, related products, picker chips, etc.

---

## Endpoint

```
GET /api/documents/resolve-refs?ids=<uuid1>,<uuid2>&locale=<optional>
```

| Header / param | Required | Description |
|----------------|----------|-------------|
| `x-org-id` | yes | Tenant org id (same as other document APIs) |
| `ids` | yes | Comma-separated document **row ids** (max 50, deduped) |
| `locale` | no | Locale for localizable title fields; defaults to tenant `defaultLocale` |

**Route order:** registered **before** generic `GET /api/documents/:type` so `resolve-refs` is not captured as a content type name.

---

## Response

JSON object keyed by requested id. Value is resolved metadata or `null` if missing / wrong org.

```json
{
  "550e8400-e29b-41d4-a716-446655440001": {
    "documentId": "550e8400-e29b-41d4-a716-446655440001",
    "type": "category",
    "key": "yoga-mats",
    "status": "published",
    "label": "Yoga Mats",
    "imageUrl": null
  },
  "550e8400-e29b-41d4-a716-446655440002": {
    "documentId": "550e8400-e29b-41d4-a716-446655440002",
    "type": "asset",
    "key": "google-icon",
    "status": "published",
    "label": "google.svg",
    "imageUrl": "http://localhost:9000/..."
  },
  "missing-id": null
}
```

### `ResolvedDocumentRef` fields

| Field | Meaning |
|-------|---------|
| `documentId` | Row id in `documents` table |
| `type` | Document type (`product`, `category`, `asset`, …) |
| `key` | Stable slug/key for the row |
| `status` | `draft` / `published` / `archived` |
| `label` | Human-readable string (see below) |
| `imageUrl` | Preview URL for assets; `null` for content entries |

---

## Label resolution

**Content entries**

1. Load content type schema for `row.type`
2. Prefer field `key === "title"`
3. Else first `text` or `longText` field
4. If field is localizable, pick `data[field][locale]`, then default locale, then first value
5. Fallback: document `key`

**Assets**

- Label: `fileName` → `altText` → `key`
- `imageUrl`: from `storageKey` via `iconUrlFromAsset()` (same helper as auth provider icons)

---

## Errors

| Status | When |
|--------|------|
| `400` | Missing or empty `?ids=` |
| `404` | (not used per-id — unknown ids return `null` in the map) |

Org scoping: ids belonging to another org return `null`, not an error.

---

## Example (local dev)

```bash
curl -s \
  -H "x-org-id: <org-id-from-seed>" \
  "http://localhost:3000/api/documents/resolve-refs?ids=cat-uuid,asset-uuid&locale=en-US"
```

Collect ids from admin content entries or `GET /api/documents/:type/:key` responses (`id` field on the row).

---

## Implementation

| Piece | Path |
|-------|------|
| Core logic | `packages/server/src/domains/documents/resolve-refs.ts` |
| Service wrapper | `DocumentService.resolveRefs()` in `service.ts` |
| HTTP route | `packages/server/src/domains/documents/api.ts` |
| Tests | `packages/server/src/domains/documents/resolve-refs.test.ts` |

Batch limit constant: `MAX_BATCH = 50`.  
Id parsing: `parseRefIdsParam()` — trim, dedupe, cap.

---

## Related resolve paths (not this API)

| Use case | Mechanism |
|----------|-----------|
| Login social icons | `GET /auth/config` → `providerIcons` (resolved from `providerIconAssets` refs) |
| Asset admin preview | `enrichAssetUrls()` on asset GET/list |
| Edge page render | `$state` + content pipeline — full entry data, not resolve batch |

Use **this API** when you only have `{ documentId }` blobs (reference fields, cart metadata, breadcrumbs) and need display strings in one round trip.

---

## Future

- Edge cache key: `{orgId}:{documentId}:{locale}`
- Optional `?fields=` to trim payload
- Published-only filter (today returns draft labels too — caller decides)
