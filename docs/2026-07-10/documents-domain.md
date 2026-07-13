# Documents Domain — Unified JSON Document Domain

## Date: 2026-07-10
## Updated: 2026-07-11 (content modeling, rich text, assets, R2, permissions, webp/avif, hash dedup, id-based routing)

## Purpose

The `documents` domain is the **single domain that owns all versioned JSON documents**
in the platform. A document is a JSON object with its own `version`, `status`,
variant axis, and lifecycle. The domain ships with these **document-types** today and
is designed to absorb more later without new domain code:

- **`content`** — authored business data (products, pages, blog, FAQ). Media
  (images/video/PDF) stored as Cloudflare R2 URLs, never blobs.
- **`content_type`** — schema definition for content types. Field catalog with
  types, `isLocalizable`, permissions. Define once, all entries validated against it.
- **`page`** — links a logical page to a layout template and content entry.
- **`page_tree`** — URL routing tree. Locale-aware URL → page ID mapping.
  Three-layer model: routing → page identity → render.
- **`tenant_settings`** — per-tenant config: locales, SEO defaults, external
  service IDs (GA, FB Pixel, etc.).
- **`asset`** — media management. Cloudflare R2 upload, sharp variants, Stream video.
- **`layout`** — json-render layout templates. The `default` segment stores the **full
  spec**. Non-default variants store only **overrides** (partial diffs) and inherit
  everything else from default.
- **`backend-logic`** (future) — JSON-defined backend behavior/flows that need their
  own versioning + variants (e.g. JSON flow definitions).

The name `documents` is deliberate: **it avoids colliding with the json-render `spec`**,
which is the JSON *format* the edge renders. "Spec" means the format everywhere else in
this repo; the domain is `documents`.

---

## Content Modeling — Schema-First, Contentful-Style

Content is not free-form JSON. Every content entry conforms to a **content type
schema** defined by the merchant. This is the same model as Contentful: you define
the shape first, then create entries that conform to it.

### Content Type Definition (documentTypes table)

A content type is a row in `documentTypes` with a `schema` JSONB that declares its
fields. Defining a content type = inserting one row. No ALTER TABLE needed. The
platform validates every content entry against its type's schema on create/update.

```jsonc
// POST /api/documents/content-types
{
  "name": "product",
  "schema": {
    "fields": [
      { "key": "title",       "type": "text",        "required": true,  "isLocalizable": true,  "label": "Product Name" },
      { "key": "description", "type": "richText",    "required": false, "isLocalizable": true,  "label": "Description" },
      { "key": "price",       "type": "number",      "required": true,  "isLocalizable": false, "label": "Price" },
      { "key": "inStock",     "type": "boolean",     "required": false, "isLocalizable": false, "label": "In Stock" },
      { "key": "launchDate",  "type": "date",        "required": false, "isLocalizable": false, "label": "Launch Date" },
      { "key": "featuredImage","type": "media",      "required": false, "isLocalizable": true,  "label": "Featured Image",
        "constraints": { "accept": ["image/*"], "maxSizeMB": 10 } },
      { "key": "gallery",     "type": "mediaList",   "required": false, "isLocalizable": false, "label": "Gallery",
        "constraints": { "accept": ["image/*"], "maxCount": 20 } },
      { "key": "category",    "type": "reference",   "required": false, "isLocalizable": false, "label": "Category",
        "references": "category" },
      { "key": "tags",        "type": "array",       "required": false, "isLocalizable": false, "label": "Tags",
        "items": { "type": "text" } },
      { "key": "specs",       "type": "json",        "required": false, "isLocalizable": false, "label": "Specifications" }
    ]
  }
}
```

Once registered, `product` becomes a valid `:type` in `/api/documents/product`.

### Field Type Catalog

| Type | Primitives | Description |
|------|-----------|-------------|
| `text` | string | Short text, single line. Max 512 chars default. |
| `longText` | string | Multi-line plain text. Max 50,000 chars. |
| `richText` | RichTextDocument | Structured rich text (see Rich Text section). |
| `number` | number | Integer or decimal. Configurable min/max. |
| `boolean` | boolean | True/false toggle. |
| `date` | ISO 8601 string | Date/time field. |
| `media` | AssetReference | Single media asset (image, video, PDF). Validates accepted MIME types and max size. |
| `mediaList` | AssetReference[] | Ordered list of media assets. |
| `reference` | EntityReference | References another content entry by ID. Configurable `references` constraint limits which content types can be referenced. |
| `array` | T[] | Ordered list of a single primitive type. `items` defines the element type. |
| `json` | Record<string, unknown> | Arbitrary structured JSON. Escape hatch for complex nested data. |
| `enum` | string | One of a predefined set of string values. `options` array required. |

> **System fields vs user-defined fields:** The `documents` table has fixed system
> columns (`id`, `tenantId`, `type`, `key`, `version`, `segment`, `status`,
> `baseVersion`, `data`, `meta`, `created_at`, `updated_at`) managed by the system.
> The field type catalog above is for **user-defined fields** that live inside the
> `data` JSONB column. Users define fields like `title`, `price`, `description` in
> their content type schema. System fields like `key` (URL identifier), `version`,
> and `status` are never user-configurable.

### Locale — Tenant-Level, Per-Field isLocalizable

Locale management is **tenant-level**. One source of truth for which locales are
enabled. All content types inherit the tenant's locale list. Each field in a
content type schema declares `isLocalizable: true` or `isLocalizable: false`.
The API writes target one locale per request.

**Where locales are defined:**

Tenant-level configuration stored as a `tenant_settings` document type within the
documents domain. One row per tenant. All content types inherit this locale list.

```jsonc
// Documents table row: type = "tenant_settings", key = "default"
{
  "locales": ["en-US", "fr", "de"],
  "defaultLocale": "en-US"
}
```

The documents domain validates locale against this record on every content write:
- Adding `fr` to tenant settings → all `isLocalizable` fields across all content types now accept `fr` writes
- Removing `de` → rejects new `de` writes; existing `de` data stays (no data loss)
- Writing with `?locale=jp` when `jp` not in tenant's locales → rejected: `"locale 'jp' is not enabled for this tenant"`

Locales live inside the documents domain because content validation is the documents
domain's concern. The `ContentValidator` reads tenant settings at validate time.

**Content type schema with isLocalizable:**

```jsonc
// POST /api/documents/content-types
{
  "name": "product",
  "schema": {
    "fields": [
      { "key": "title",       "isLocalizable": true,  "type": "text",     "required": true,  "label": "Product Name" },
      { "key": "description", "isLocalizable": true,  "type": "richText", "required": false, "label": "Description" },
      { "key": "price",       "isLocalizable": false, "type": "number",   "required": true,  "label": "Price" },
      { "key": "inStock",     "isLocalizable": false, "type": "boolean",  "required": false, "label": "In Stock" },
      { "key": "featuredImage","isLocalizable": true, "type": "media",    "required": false, "label": "Featured Image" },
      { "key": "tags",        "isLocalizable": false, "type": "array",    "required": false, "label": "Tags",
        "items": { "type": "text" } }
    ]
  }
}
```

**How API writes work — one locale per request:**

Each API write targets exactly one locale via query param `?locale=en-US`. The
entry accumulates values across multiple locale writes.

```
# Write English title (isLocalizable field)
POST /api/documents/product?locale=en-US
{ "title": "Blue Sneakers", "description": "<rich-text-en>" }

# Write French title (isLocalizable field) — only pass localizable fields
POST /api/documents/product/blue-sneakers?locale=fr
{ "title": "Baskets Bleues", "description": "<rich-text-fr>" }

# Write non-localizable fields (no locale param — locale ignored for these fields)
PUT /api/documents/product/blue-sneakers
{ "price": 99.99, "inStock": true, "tags": ["running"] }
```

Internally stored:

```
// Single row in documents table
{
  "title":       { "en-US": "Blue Sneakers", "fr": "Baskets Bleues" },
  "description": { "en-US": "<rich-text-en>", "fr": "<rich-text-fr>" },
  "price":       99.99,
  "inStock":     true,
  "featuredImage": { "en-US": { "assetId": "a1" }, "fr": { "assetId": "a2" } },
  "tags":        ["running"]
}
```

**Validation flow:**

```
PUT /api/documents/product/blue-sneakers?locale=fr

  1. Check tenant's allowed locales → "fr" is in ["en-US", "fr", "de"] ✓
     If "fr" not allowed → reject: "locale 'fr' is not enabled for this tenant"

  2. For each field in the content type schema:
     - isLocalizable: true  → accept field value, merge as { ...existing, fr: value }
                              Validation: value must match field type (text, number, etc.)
     - isLocalizable: false → reject if field is present in locale-targeted write
                              "field 'price' is not localizable — write without ?locale param"

  3. Store merged data
```

**How locale resolution works at render time:**

```
Visitor request:
  GET https://store.fr/products/baskets-bleues
  Accept-Language: fr, en;q=0.9

Edge worker:
  1. Extract locale from Accept-Language header / URL path / cookie → "fr"
  2. Check tenant's enabled locales → "fr" is allowed
  3. Fetch content entry from KV/API
  4. For each field in the content type schema:
     - isLocalizable: true  → pick locale "fr" from { en-US: "...", fr: "..." }
                              Fallback: fr missing → tenant's defaultLocale (en-US) → first available
     - isLocalizable: false → use value as-is
  5. Inject resolved values into json-render $state
```

**Why tenant-level locales (Option B over A):**

| Aspect | Per content type (Option A) | Per tenant (Option B, chosen) |
|--------|---------------------------|-------------------------------|
| Where defined | Each content type's schema | One tenant settings record |
| Adding a locale | Update every content type | Update one record |
| Consistency risk | Types A and B have different locale lists | All types share the same list |
| API contract | Ambiguous — which type's locales apply? | Clear — tenant's locales apply everywhere |
| Maintenance | N content types × locale config changes | 1 config change |

**What happens when a locale is removed:**

```
Tenant removes "de" from locales: ["en-US", "fr"]
  → New writes with ?locale=de are rejected
  → Existing "de" values remain in data (not deleted — no data loss)
  → Edge resolution falls back: de requested → not in tenant's locales → use defaultLocale (en-US)
```

**Why per-field isLocalizable, not per-entry locales:**

An entry is NOT duplicated per locale (no `product-fr`, `product-de` entries). One
entry, one key, all locales in one row. The per-field flag is simple:

| Approach | Storage | Duplication | Maintenance |
|----------|---------|-------------|-------------|
| Per-field (chosen) | One row per product | Zero. Locales are keys on isLocalizable fields only. | Add a locale → isLocalizable fields auto-grow a key. isLocalizable: false fields unchanged. |
| Per-entry locale | N rows per product (one per locale) | Price, stock, tags duplicated N times. Slug collision. | Change price → update all N locale entries. Miss one → stale. |

### Schema Validation Pipeline

```
Content entry create/update with ?locale=en-US
  → Check tenant's enabled locales → locale is allowed ✓
  → Load content type schema from documentTypes
  → Zod schema generated from field definitions:
    - isLocalizable: true  → field value is locale-keyed merge (primitive type per locale)
    - isLocalizable: false → field value is plain primitive
    - Non-localizable field in locale-targeted write → rejected
  → Validate entry data against Zod schema
  → Resolve media references (validate assets exist)
  → Resolve entity references (validate referenced entries exist)
  → Merge locale value into existing data for isLocalizable fields
  → Store in documents table (status: draft)
  → On publish → status: published, emit content.published event
```

The `ContentValidator` interface in `ports.ts` (currently a stub returning `{ valid: true }`)
is replaced with a real Zod-based validator that generates validation schemas from the
`documentTypes.schema` JSONB. This means adding a field to a content type updates
validation for all entries of that type — no code change, no deploy.

---

## Rich Text

Rich text is a first-class field type. Content entries with a `richText` field store
a structured JSON document (not HTML, not Markdown) that the client renders
differently per surface (web, mobile, email, API).

### Rich Text Document Model (Contentful-style)

A rich text document is a tree of **block nodes** and **inline nodes**. Every node
has a `nodeType` and optional `data`. Text-bearing nodes have an array of `marks`.

```jsonc
// Example: a richText field value inside a content entry's data
{
  "nodeType": "document",
  "content": [
    {
      "nodeType": "heading-2",
      "content": [
        {
          "nodeType": "text",
          "value": "Product Overview",
          "marks": [{ "type": "bold" }]
        }
      ]
    },
    {
      "nodeType": "paragraph",
      "content": [
        {
          "nodeType": "text",
          "value": "This is a ",
          "marks": []
        },
        {
          "nodeType": "text",
          "value": "bold claim",
          "marks": [{ "type": "bold" }]
        },
        {
          "nodeType": "text",
          "value": " about our product.",
          "marks": []
        }
      ]
    },
    {
      "nodeType": "unordered-list",
      "content": [
        {
          "nodeType": "list-item",
          "content": [
            { "nodeType": "text", "value": "Item one", "marks": [] }
          ]
        },
        {
          "nodeType": "list-item",
          "content": [
            { "nodeType": "text", "value": "Item two", "marks": [] }
          ]
        }
      ]
    },
    {
      "nodeType": "embedded-asset-block",
      "data": {
        "target": {
          "type": "asset",
          "assetId": "asset_01JXXX...",
          "altText": "Product hero shot"
        }
      }
    },
    {
      "nodeType": "embedded-entry-block",
      "data": {
        "target": {
          "type": "entry",
          "entryId": "entry_01JYYY...",
          "contentType": "callout"
        }
      }
    },
    {
      "nodeType": "hr"
    }
  ]
}
```

### Node Types

**Block nodes (top-level):**

| nodeType | Description |
|----------|-------------|
| `paragraph` | Standard text block |
| `heading-1` through `heading-6` | Headings |
| `blockquote` | Quoted text |
| `unordered-list` | Bullet list container |
| `ordered-list` | Numbered list container |
| `list-item` | Single list item (child of `unordered-list` or `ordered-list`) |
| `hr` | Horizontal rule |
| `embedded-asset-block` | Embedded media asset (image, video preview) |
| `embedded-entry-block` | Embedded reference to another content entry (e.g. a "callout" block) |
| `embedded-video-block` | Embedded video with caption |
| `code-block` | Code block with optional language |

**Inline nodes (inside block text):**

| nodeType | Description |
|----------|-------------|
| `text` | Leaf text node (carries `marks` and `value`) |
| `hyperlink` | Clickable link with `data.uri` |
| `embedded-asset-inline` | Inline image/icon |
| `embedded-entry-inline` | Inline content entry reference |

**Marks (formatting spans on text nodes):**

| mark type | Description |
|-----------|-------------|
| `bold` | Bold text |
| `italic` | Italic text |
| `underline` | Underlined text |
| `code` | Inline code |
| `strikethrough` | Strikethrough text |

### Rich Text Rendering

The rich text document is the **source of truth**. Each rendering surface converts it:

- **Web (React):** `json-render` runtime walks the rich text tree, maps each
  `nodeType` to a React component. Marks become `<strong>`, `<em>`, `<code>`, etc.
  Embedded assets become `<img>` tags with R2 URLs. Embedded entries fetch and render
  the referenced content entry's data inline.
- **Mobile (React Native):** Same nodes, different component mapping (native `<Text>`,
  `<Image>`).
- **SEO (Edge prerender):** Cloudflare Worker renders the rich text tree to semantic
  HTML via `json-render/core` at prerender time.
- **API/headless:** Structured JSON returned as-is for headless consumers.

The rich text tree is **validated at write time**: the content type schema declares
which node types and marks are allowed. For example, a "product short description"
field might only allow `paragraph`, `text`, `bold`, and `italic` — no headings, no
embedded media. A "blog body" field allows all node types.

---

## Assets — Media Management on Cloudflare R2

Assets (images, videos, PDFs, and other files) uploaded by merchants are stored in
**Cloudflare R2** (S3-compatible, zero egress). The documents domain treats assets as
first-class entities with their own lifecycle, not as raw URLs embedded in content
JSON.

### Asset Model

An asset is a record in the `documents` table with `type: "asset"`. It carries
metadata about the original file and its processed variants.

```
documents table row, type = "asset":
{
  id:           UUID,
  tenantId:     UUID,
  type:         "asset",
  key:          assetId (UUID key),
  segment:      "default",
  status:       "draft" | "published",
  data: {
    fileName:      "hero-shot.png",
    mimeType:      "image/png",
    fileSizeBytes: 2457600,
    original: {
      url:         "https://r2.noname.dev/assets/tenant_01/hero-shot_abc123.png",
      width:       2400,
      height:      1600,
    },
    variants: {
      "thumbnail": { url: "...", width: 150,  height: 100  },
      "small":     { url: "...", width: 480,  height: 320  },
      "medium":    { url: "...", width: 960,  height: 640  },
      "large":     { url: "...", width: 1920, height: 1280 },
      "avif":      { url: "...", width: null, height: null, format: "avif" },
      "webp":      { url: "...", width: null, height: null, format: "webp" }
    },
    altText:      "Product hero shot on white background",
    caption:      null,
    focalPoint:   { x: 0.5, y: 0.25 },
    uploadedAt:   "2026-07-11T10:30:00Z"
  },
  meta: { ... }
}
```

### Asset Upload Flow

```
1. Client POST /api/documents/assets/upload
   multipart/form-data:
     file:        <binary>
     altText:     "Product hero shot"
     caption:     (optional)
     focalPoint:  (optional, x/y center coordinates)
     tags:        (optional, string array)

2. Server validates:
   - File size (max 50MB per asset, configurable per tenant)
   - MIME type against allowed types (image/*, video/*, application/pdf)
   - No duplicate hash (SHA-256 of file body → if exists, return existing asset)

3. Upload to Cloudflare R2:
   - Bucket: noname-assets-{env}
   - Key: {tenantId}/{assetId}/{originalFilename}
   - Object metadata: tenantId, assetId, originalFilename, uploadedAt

4. Image processing (Cloudflare Images OR self-managed pipeline):
   - Original → thumbnail (150px), small (480px), medium (960px), large (1920px)
   - Auto-generate WebP and AVIF variants from each size
   - Crop based on focalPoint if provided
   - All variants written back to R2 under {tenantId}/{assetId}/variants/

5. Video processing (Cloudflare Stream):
   - Upload original to Stream
   - Auto-transcode to HLS adaptive bitrate
   - Stream returns playback URL + thumbnail URL
   - Store Stream video UID + playback URL in asset data

6. Create asset document row (status: "draft")

7. Publish asset → status: "published", emit asset.created event, R2 cache TTL = 1 year

8. Return asset DTO with all variant URLs
```

### Image Delivery

Images are served via **Cloudflare Image Resizing** (`/cdn-cgi/image/`). The client
requests images with query parameters for size, format, and quality — Cloudflare
transforms and caches at the edge. No pre-generated variant URLs needed for images
if using Cloudflare Images, but pre-generated variants in R2 provide deterministic
URLs for SEO and headless consumers.

```
https://assets.noname.dev/tenant_01/asset_abc/original.png?width=480&format=webp
```

For video, Cloudflare Stream provides HLS playback URLs. The asset data stores the
Stream video UID and the playback URL for embedding.

### Asset Reference in Content

Content fields of type `media` or `mediaList` store **asset IDs**, not URLs. At read
time (or at edge render time), the platform resolves asset IDs to actual R2 URLs with
appropriate variant selection based on the requesting context (viewport size, device
type, network quality).

```jsonc
// Content entry data (what the API returns)
{
  "featuredImage": {
    "assetId": "asset_01JXXX...",
    "altText": "Product hero shot",
    // Variant URLs resolved at render time:
    "_resolved": {
      "thumbnail": "https://r2.noname.dev/.../hero-shot_thumbnail.webp",
      "small":     "https://r2.noname.dev/.../hero-shot_small.webp",
      "medium":    "https://r2.noname.dev/.../hero-shot_medium.webp",
      "large":     "https://r2.noname.dev/.../hero-shot_large.webp"
    }
  }
}
```

### Supported Asset Types

| MIME Family | Accepted Types | Processing |
|-------------|---------------|------------|
| `image/*` | PNG, JPEG, WebP, AVIF, GIF, SVG | Resize to variants (thumbnail/small/medium/large), auto WebP/AVIF. SVG served as-is. |
| `video/*` | MP4, WebM, MOV, AVI | Upload to Cloudflare Stream → auto HLS transcoding → adaptive bitrate playback. |
| `application/pdf` | PDF | Stored as-is in R2. No processing. Preview thumbnail generated at first request via Cloudflare Images. |
| Other files | ZIP, CSV, etc. | Stored as-is. No processing. Download-only. Configurable per tenant. |

### Asset Lifecycle

```
draft     → Asset uploaded, not yet visible to public APIs.
published → Asset live, R2 URLs active, cache TTL set.
archived  → Asset hidden from public APIs. R2 object retained (soft delete).
purged    → R2 object deleted. Asset row deleted. Irreversible.
```

Assets are **versioned by hash**: uploading the same file twice creates no duplicate
R2 objects. The SHA-256 hash of the file body is stored in the asset data. Re-uploads
of the same file return the existing asset (idempotent).

---

## Content Permissions — Field-Level

The content type schema supports field-level permissions via a `permissions` object
on each field definition. This controls which roles can read or write specific fields
within a content entry.

```jsonc
{
  "key": "price",
  "type": "number",
  "required": true,
  "permissions": {
    "read":  ["merchant", "admin", "api"],
    "write": ["admin"]
  }
}
```

| Permission | Scope |
|-----------|-------|
| `read` | Roles that can see this field's value in API responses |
| `write` | Roles that can modify this field's value |

The `ContentDocumentService` applies field-level filtering on read (strip fields the
caller's role cannot read) and field-level validation on write (reject writes to
fields the caller's role cannot write).

---

## Why one domain (not N domains)

`content`, `layout`, `asset`, and `backend-logic` are **the same kind of thing**: a
versioned JSON document with variants. Forcing each into its own DDD domain duplicates
identical ports/adapters/versioning/cache/event code N times. One domain + a **type
registry** (`DocumentStorage` keyed by `type`) provides the shared machinery once:

- store / read by `(tenantId, type, key)`
- version + publish (draft → published)
- per-segment / per-context variants
- cache invalidation
- domain events
- field-level permission filtering
- schema validation

Each type keeps its **own**:
- `version` and `status` (content drafts vs layout publishes vs asset uploads never collide)
- cache key (content by `{tenantId}:{type}:{key}`, layout by `{tenantId}:{templateName}:{segmentHash}`, asset by `{tenantId}:{assetId}`)
- event names (`content.created`, `layout.published`, `asset.created`)
- schema definition (content has field schemas, layout has json-render spec format, asset has variant metadata)

All KV cache keys include `tenantId` to prevent cross-tenant collisions and enable
per-tenant cache invalidation without blast-radius across tenants.

---

## What we explicitly rejected: merging the *documents*

Merging into **one JSON blob** (one table, one shared `version`, layout copied into
every content entry) was rejected. That model has real, concrete costs:

1. **Version collision** — one `version` field can't mean both "layout published v3"
   and "product draft v2". You'd have to re-add `contentVersion`/`layoutVersion`
   sub-fields, which is just rebuilding two domains inside one.
2. **Cache-blast** — a price edit bumps the shared version → the *layout* cache
   invalidates for every product (1,000 unnecessary edge re-renders). Separate types
   cache independently.
3. **Blurrier permissions** — one endpoint means a merchant editing a price can also
   touch layout JSON. Separate types let you scope roles per type inside the one
   domain.

The decision: **merge the domain boundary, never the documents.** Data stays in
separate type-specific JSONB data; only the module boundary collapses.

---

## Storage Model — System Columns vs User-Defined Fields

The `documents` table splits storage into two tiers:

**System columns (real Postgres columns) — fixed, indexed, never user-configurable:**

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID PK | Row identity |
| `tenant_id` | UUID | Multi-tenant isolation |
| `type` | TEXT | Document-type discriminator (content, layout, page_tree, etc.) |
| `key` | TEXT | URL identifier. Auto-generated from title. Stable across locales. |
| `version` | INT | Monotonic version per row |
| `segment` | TEXT | Variant axis. "default" for non-layout types. |
| `status` | ENUM | draft / published / archived |
| `base_version` | INT | Default version this variant's overrides are based on |
| `created_at` | TIMESTAMP | Audit |
| `updated_at` | TIMESTAMP | Audit |

These columns have database-level constraints, B-tree indexes, and are shared
by ALL document types. Adding a new document type never requires a migration.

**User-defined fields (`data` JSONB) — validated by app, never become columns:**

All fields defined in the content type schema (`title`, `price`, `description`,
etc.) live inside `data` JSONB. The `ContentValidator` (Zod) validates values
against the content type's field definitions. No ALTER TABLE, no per-type
table creation, no per-field column migration.

**Why not separate tables per content type:**

| Approach | Multi-tenant impact | Field changes | Querying |
|----------|-------------------|---------------|----------|
| Separate tables per type | N content types × T tenants = explosion | Every field add/remove = migration | Native SQL on columns |
| **Unified JSONB (chosen)** | One table, tenant-filtered by `tenant_id` | Zero migrations. Schema in `documentTypes` | JSONB path queries + GIN indexes |

For a multi-tenant system where each tenant can define their own content types
with unique field sets, separate tables don't scale. 50 tenants × 10 content
types = 500 tables. 500 tables × 5 field changes per day = 2,500 migrations.

The unified JSONB model means:
- Adding a content type = `INSERT INTO document_types`
- Adding a field = `UPDATE document_types SET schema = jsonb_set(...)`
- No migration. No deploy. No per-tenant table creation.

System fields that need SQL-level querying, indexing, and ACID constraints live
as real columns. User-defined fields that are schema-driven and flexible live in
JSONB. Each field knows its type from the content type schema — the validator
enforces correctness at write time, not the database.

---

## Concrete model

```
ONE domain:   documents
  ├─ type: content        → data JSONB, keyed (tenantId, type, key), validated against content type schema
  ├─ type: content_type   → schema definition JSONB, keyed (tenantId, name), defines field catalog for a content type
  ├─ type: page           → layout + content reference, keyed (tenantId, key), links URL to render targets
  ├─ type: page_tree      → URL routing tree, keyed (tenantId, key), locale-aware URL → page ID mapping
  ├─ type: tenant_settings→ per-tenant config JSONB, keyed (tenantId, "default"), locales + defaultLocale
  ├─ type: asset          → media metadata JSONB, keyed (tenantId, assetId), variants stored in R2
  ├─ type: layout         → spec JSONB. segment="default": full spec. segment≠"default": overrides only.
  │                          keyed (tenantId, templateName, segment), versioned, per-tenant KV cached
  │                          `resolve` deep-merges default + overrides → returns full spec
  └─ type: backend-logic  → flow JSONB (future), versioned, variants
```

Routes (one mount):
```
# Content type schema management (schema-first)
POST   /api/documents/content-types              # define a new content type (schema + fields)
GET    /api/documents/content-types              # list all content types
GET    /api/documents/content-types/:name        # get one content type schema
PUT    /api/documents/content-types/:name        # update content type schema (add/remove fields)

# CRUD by type
POST   /api/documents/:type                      # create entry (validated against content type schema)
GET    /api/documents/:type                      # list entries by type
GET    /api/documents/:type/:key                 # get entry by key
PUT    /api/documents/:type/:key                 # update entry
DELETE /api/documents/:type/:key                 # delete entry
PUT    /api/documents/:type/:key/publish         # publish entry

# Page tree routing
GET    /api/documents/page_tree/resolve          # resolve page by URL path + locale (query: ?url=/products&locale=fr)

# Tenant settings
GET    /api/documents/tenant_settings/default    # get tenant locale config

# Variants (layout, backend-logic)
PUT    /api/documents/:type/:name/variants       # add variant for segment
GET    /api/documents/:type/:name/resolve        # resolve per segment

# Assets
POST   /api/documents/assets/upload              # upload asset to R2 (multipart)
GET    /api/documents/assets                     # list assets
GET    /api/documents/assets/:assetId            # get asset metadata + resolved variant URLs
PUT    /api/documents/assets/:assetId            # update asset metadata (altText, caption, tags)
DELETE /api/documents/assets/:assetId            # archive asset
PUT    /api/documents/assets/:assetId/publish    # publish asset
```

Events (distinct per type, NOT a shared namespace):
```
content.created, content.updated, content.deleted, content.published
content_type.created, content_type.updated
page_tree.created, page_tree.updated
page.created, page.updated, page.published
tenant_settings.updated
asset.created, asset.uploaded, asset.processed, asset.published, asset.archived
layout.created, layout.updated, layout.published, layout.archived, layout.variant_created
backend-logic.updated   (future)
```

---

## Segment Model — Rule-Based, Finite, Cacheable

Segments are **rule-based buckets**, not per-user identifiers. A small, finite set of
segment definitions per tenant keeps the KV cache hit rate high and prevents
cache-blast.

### What a segment IS

A segment is a **named group of user behavior conditions** defined per tenant. The
context engine classifies each visitor into exactly one segment based on their past
actions, engagement signals, and analytics data — NOT from HTTP headers like device
or IP geo.

```
Segment definitions (per tenant):
  "vip_customer"          → { purchases: "> 5", lifetimeValue: "> $500" }
  "returning_browser"     → { visits: "> 3", purchased: false }
  "first_time_visitor"    → { visits: "= 0" }
  "premium_interest"      → { browsedCategories: "premium", pageViews: "> 10" }
  "abandoned_cart"        → { cartItems: "> 0", sessionDuration: "> 5min" }
  "newsletter_subscriber" → { subscribed: true }
  "price_sensitive"       → { avgBrowsedProductPrice: "< $50" }
  "default"               → { } (catch-all)
```

Segments are **behavior-based**, finite (10-100 per tenant), and defined by the
tenant based on what matters to their business. Each segment maps to a layout
variant. Each variant is KV-cached independently.

### What a segment is NOT

A segment is **not locale** — locale is resolved by content's `isLocalizable`
fields at render time, not by the segment system.

A segment is **not device type** (mobile/desktop) — responsive design in the
layout spec handles rendering for different screen sizes. The layout variant
override model handles device-specific layout differences.

A segment is **never a per-visitor identity**. Do not include user IDs, session
IDs, or any high-cardinality value in segment conditions. If segments become
per-user, every visitor gets a unique cache key → KV hit rate 0% → every page
render hits origin.

### Per-segment (cached) vs per-user ($state, not cached)

```
SEGMENT (cached in KV):
  "vip_customer" → selects layout variant: premium upsell blocks, loyalty banner
  Cache key:    layout:{tenantId}:product_page:vip_customer
  Cache TTL:    until layout is republished

PER-USER ($state, resolved per request, NOT cached):
  { username: "Alice", cartCount: 3, recommendedProducts: [...] }
  Injected into json-render $state at edge render time
  Source: JWT claims, user profile cache, or recommendation API
  NEVER part of the segment hash
```

The layout variant is selected by segment and KV-cached. Per-user data is injected
into the spec's `$state` bindings at render time by the edge worker. Two different
channels, two different caching strategies.

### Tenant-scoped segments

Segments are defined **per tenant** in the `segments` table (`segments.tenantId`).
Each tenant has their own taxonomy. The same signal combination produces the same
deterministic hash, but the KV cache key includes `tenantId` so there is no
cross-tenant collision:

```
layout:{tenantId}:{templateName}:{segmentHash}

Example:
  layout:tenant_01:homepage:vip_hash   ← Tenant A's VIP homepage variant
  layout:tenant_02:homepage:vip_hash   ← Tenant B's VIP homepage variant
                                         Different value, no collision
```

Cache invalidation is also per-tenant: when tenant A publishes a new layout variant,
only `layout:tenant_01:*` keys are invalidated. Tenant B's cache is untouched.

---

## Edge Rendering Flow — End to End

```
1. Visitor lands on https://storeA.com/products/blue-sneakers

2. Edge worker extracts user context:
     JWT claims              → userId=abc123, username=Alice
     Accept-Language header  → locale=fr
     Cookie / session data   → visitor behavior signals

3. Edge calls context engine: POST /api/context/resolve
     Input:  { tenantId, purchases: 12, visits: 45, subscribed: true, ... }
     Output: segment = "vip_customer"  (matched against tenant's behavior-based segment rules)
              Or "default" if no rules match

4. Edge checks Workers KV for cached layout:
     Key:  layout:tenant_01:product_page:vip_customer
     Hit:  return spec (<5ms, zero origin load)
     Miss: GET /api/documents/layout/product_page/resolve?segment=vip_customer
           → KV.put(key, spec, { ttl: until_published })
           → return spec

5. Edge fetches content data (cached or origin):
     Key:  content:tenant_01:product:blue-sneakers
     Hit:  return content entry (<5ms)
     Miss: GET /api/documents/product/blue-sneakers
           → KV.put(key, entry, { ttl: until_published })

6. Edge resolves asset references in content data:
     media field "featuredImage" → assetId → R2 variant URL for viewport
     media field "gallery"       → assetIds → R2 variant URLs

7. Edge merges layout spec + content data via json-render:
     resolveElementProps(spec, $state: {
       ...contentEntry.data,     ← cached content
       username: "Alice",        ← per-user, from JWT
       cartCount: 3,             ← per-user, from cart service
       recommendedProducts: [...] ← per-user, from recommendation API
     })

8. Edge renders to HTML (SEO prerender) OR returns JSON (client-side render)
   HTML cached in KV keyed by (tenantId, template, segment, key, contentVersion)
```

### KV Cache Key Scheme

| Cached Entity | KV Key Pattern | Invalidated By |
|--------------|----------------|----------------|
| Layout spec | `layout:{tenantId}:{templateName}:{segmentHash}` | `layout.published` event for that tenant |
| Content entry | `content:{tenantId}:{type}:{key}` | `content.published` / `content.updated` / `content.deleted` |
| Rendered HTML | `html:{tenantId}:{template}:{segment}:{key}:{contentVersion}` | Layout OR content publish for that tenant |
| Asset metadata | `asset:{tenantId}:{assetId}` | `asset.published` / `asset.archived` |
| Asset binary | R2 CDN (immutable, 1-year TTL) | Asset re-upload (new hash → new object path) |

### Segment Fallback Resolution

`GET /api/documents/layout/:name/resolve?segment=X` performs a fallback chain when
an exact segment match doesn't exist:

```
Visitor segment: "vip_newsletter_subscriber"
  1. Exact match: "vip_newsletter_subscriber"  → MISS
  2. Parent: "vip_customer"                     → MATCH → return VIP layout
  3. (else try "newsletter_subscriber")
  4. (else return "default")
```

Segments can form a hierarchy. A tenant defines `vip_customer` and
`newsletter_subscriber`. A visitor who is both VIP and subscribed creates a
compound segment that falls back through each parent until a match is found.

---

## Variant Inheritance — Override Model (Core Design)

Non-default layout variants store only **overrides** (partial diffs), not full copies.
The `resolve` endpoint deep-merges `default + overrides` and returns the full spec.
The merge happens on the API server; the KV-cached result is the full merged output
the edge worker consumes directly.

```
STORAGE (what's in the DB):
  default:     { sections: [ hero:2col, features:3col, footer, newPromo:v1 ] }
               ← full spec, always

  mobile:      { baseVersion: "v3",
                 overrides: {
                   "sections.hero.columns": 1,
                   "sections.features.columns": 1
                 }}
               ← only the differences, nothing else

  desktop_vip: { baseVersion: "v5",
                 overrides: {
                   "sections.hero.upsell": true
                 }}
               ← only the one toggle

RESOLVE (server-side, per request):
  GET /api/documents/layout/homepage/resolve?segment=mobile

  1. Load default spec (full)
  2. Load mobile overrides (diff)
  3. deepMerge(default, overrides)
     → hero:1col, features:1col, footer, newPromo:v1
  4. KV.put(layout:tenant_01:homepage:seg_mobile, mergedSpec)
  5. Return full merged spec through API

  → mobile automatically inherits footer + newPromo
  → only hero.columns and features.columns are overridden
```

### Why merge server-side, not edge-side

| Approach | Pros | Cons |
|----------|------|------|
| Merge at edge | Less server CPU | Edge worker must load both default + variant, merge logic in worker code, harder to cache the intermediate merge step |
| **Merge at server (chosen)** | Edge gets ready-to-use spec, merge result is KV-cached, merge cost amortizes to near-zero after first request | resolve endpoint does one extra merge pass per cache miss |

The merge cost is paid once per variant per publish cycle. Every subsequent request
hits KV cache (<5ms, zero merge). The edge worker stays thin — fetch from KV, render,
done.

### Conflict Detection with baseVersion

The `baseVersion` field replaces the old `parentVersion`. It records which version
of the default the overrides were written against. When the default is republished
(version increments), the server detects if any override paths no longer resolve:

```
DEFAULT v5:  sections: [ hero:2col, features:3col, footer ]
MOBILE:      baseVersion: v4, overrides: { "hero.columns": 1 }
             → hero exists in v5, override applies cleanly ✓

DEFAULT v6:  sections: [ heroBanner:2col, features:3col, footer ]
             (renamed sections.hero → sections.heroBanner)
MOBILE:      baseVersion: v4, overrides: { "hero.columns": 1 }
             → sections.hero no longer exists → CONFLICT ✗
             → flag for merchant review, fall back to default's heroBanner
```

Without `baseVersion`, the override silently fails — the mobile variant gets
heroBanner:2col instead of hero:1col, with no warning. `baseVersion` catches this.

### Data model change

```
documents table, type = "layout":
  segment = "default"     → data.spec = { full json-render spec }
  segment ≠ "default"     → data.overrides = { partial diff }
                            data.baseVersion = "v5"  (version of default this overrides was based on)
```

The `spec` column name is misleading for non-default variants. The unified `data`
JSONB column stores the type-appropriate payload. `resolve` checks `segment`:
- `segment === "default"` → return `data.spec` as-is
- `segment !== "default"` → load default's `data.spec`, deep-merge with variant's `data.overrides`, return full merged spec

---

## How json-render Renders a Page

The layout spec is a **json-render template** — a JSON tree of component declarations.
The edge worker calls `resolveElementProps(spec, $state)` which walks the tree,
resolves all `$state.*` references, and produces the final component props. The
client renders the resolved tree.

### Layout Spec → $state → Resolved Tree

**Layout spec (`product_page`, default segment, full):**
```jsonc
{
  "type": "Page",
  "props": { "theme": "light" },
  "children": [
    {
      "type": "HeroBanner",
      "props": {
        "image":   { "$state": "featuredImage" },
        "title":   { "$state": "title" },
        "ctaText": "Buy Now",
        "ctaUrl":  "/checkout"
      }
    },
    {
      "type": "ProductInfo",
      "props": {
        "price":       { "$state": "price" },
        "description": { "$state": "description" }
      }
    },
    {
      "type": "RelatedProducts",
      "props": {
        "products": { "$state": "recommendedProducts" }
      }
    },
    {
      "type": "Footer",
      "props": { "links": "[...]", "copyright": "2026" }
    }
  ]
}
```

**Content entry (`product:blue-sneakers`, locale: fr) — resolved by isLocalizable:**
```jsonc
{
  "title":        "Baskets Bleues",
  "description":  "<rich-text-fr>",
  "price":        99.99,
  "featuredImage": { "url": "https://r2.../hero_fr.webp", "alt": "Hero shot" }
}
```

**Per-user `$state` (injected separately, NOT cached by segment):**
```jsonc
{
  "username":             "Alice",
  "cartCount":            3,
  "recommendedProducts":  [ { "title": "Red Sneakers", "price": 89.99 } ]
}
```

**Final merged `$state` (edge worker combines content + per-user before render):**
```jsonc
{
  "title":               "Baskets Bleues",
  "description":         "<rich-text-fr>",
  "price":               99.99,
  "featuredImage":       { "url": "https://r2.../hero_fr.webp", "alt": "Hero shot" },
  "username":            "Alice",
  "cartCount":           3,
  "recommendedProducts": [ { "title": "Red Sneakers", "price": 89.99 } ]
}
```

**After `resolveElementProps(spec, $state)` — the resolved tree:**
```jsonc
{
  "type": "Page",
  "props": { "theme": "light" },
  "children": [
    {
      "type": "HeroBanner",
      "props": {
        "image":   { "url": "https://r2.../hero_fr.webp", "alt": "Hero shot" },
        "title":   "Baskets Bleues",
        "ctaText": "Buy Now",
        "ctaUrl":  "/checkout"
      }
    },
    {
      "type": "ProductInfo",
      "props": {
        "price":       99.99,
        "description": "<rich-text-fr>"
      }
    },
    {
      "type": "RelatedProducts",
      "props": {
        "products": [ { "title": "Red Sneakers", "price": 89.99 } ]
      }
    },
    {
      "type": "Footer",
      "props": { "links": "[...]", "copyright": "2026" }
    }
  ]
}
```

All `$state` references are resolved. The client receives this tree and renders
`<HeroBanner>`, `<ProductInfo>`, `<RelatedProducts>`, `<Footer>` with their
resolved props. No data fetching on the client — the edge did all the work.

### VIP Variant: What Changes

The VIP customer variant overrides only two props. The rest inherits from default.

**VIP variant overrides (stored in DB):**
```jsonc
{
  "baseVersion": 4,
  "overrides": {
    "ctaText": "VIP Price: $79.99",
    "image":   "hero_vip.webp"
  }
}
```

**After `resolve` merges default + VIP overrides — the merged spec:**
```jsonc
{
  "type": "Page",
  "children": [
    {
      "type": "HeroBanner",
      "props": {
        "image":   "hero_vip.webp",           // ← overridden by variant
        "title":   { "$state": "title" },
        "ctaText": "VIP Price: $79.99",       // ← overridden by variant
        "ctaUrl":  "/checkout"
      }
    },
    { "type": "ProductInfo",   "props": { ... } },   // ← inherited from default
    { "type": "RelatedProducts", "props": { ... } },  // ← inherited from default
    { "type": "Footer",        "props": { ... } }     // ← inherited from default
  ]
}
```

After `resolveElementProps` with the same `$state`, the VIP French visitor sees
"Baskets Bleues" title with "VIP Price: $79.99" CTA and the VIP hero image.
Everything else is identical to the default layout.

### Where Each Data Source Connects

| json-render concept | Document type | Resolved by | Example |
|---------------------|--------------|-------------|---------|
| Spec (template) | `layout` (default segment) | Designer defines in admin | Page with Hero, Info, Footer |
| Variant override | `layout` (non-default segment) | `resolve` deep-merge | VIP overrides hero.cta and hero.image |
| Merged spec | `resolve` endpoint output | Server-side merge, KV-cached | Full spec with VIP tweaks |
| `$state` bindings | Content data + per-user data | Edge worker `resolveElementProps` | `{ "$state": "title" }` → "Baskets Bleues" |
| Resolved tree | Final output to client | JSON with all bindings replaced | `<HeroBanner title="Baskets Bleues" />` |

### Client-Side: From JSON to DOM

The edge worker delivers the resolved JSON tree to the browser. The client uses the
**json-render runtime** to turn this JSON into real DOM elements.

**Step 1 — Component catalog (static, shipped from R2):**
```typescript
// This map lives in the client bundle. Each tenant can register their own
// components, but the runtime is shared.
const componentCatalog: Record<string, React.ComponentType<any>> = {
  Page:             PageComponent,
  HeroBanner:       HeroBannerComponent,
  ProductInfo:      ProductInfoComponent,
  RelatedProducts:  RelatedProductsComponent,
  Footer:           FooterComponent,
};
```

**Step 2 — Render function (json-render runtime):**
```typescript
// The runtime walks the JSON tree and creates React elements.
// This is what json-render/core provides — not written by the tenant.
function renderElement(node: ResolvedNode): React.ReactNode {
  const Component = componentCatalog[node.type];
  if (!Component) return null; // unknown component → skip

  const children = node.children?.map(renderElement);

  return React.createElement(Component, node.props, ...children);
}
```

**Step 3 — Hydration (browser):**
```
1. Browser receives resolved JSON from edge worker:
     GET https://store.fr/produits/baskets-bleues
     Response: { resolved JSON tree — all $state bindings already filled }

2. json-render runtime calls renderElement(resolvedTree)
     → Maps each node.type to a React component
     → Passes resolved props directly (no more data fetching)
     → Renders to DOM

3. Interactive elements (cart, forms, add-to-cart button) are hydrated
     → These components have their own client-side state
     → They call the API server directly for mutations:
        POST /api/machines/cart/addToCart
        POST /api/machines/checkout/start
```

**Where each function runs:**

| Function | Runs on | Input | Output |
|----------|---------|-------|--------|
| `resolve` (merge) | API server | Default spec + variant overrides | Full merged spec |
| `resolveElementProps` | Edge worker (Cloudflare) | Merged spec + $state | Resolved JSON tree (no $state refs) |
| `renderElement` | Client browser | Resolved JSON tree | React element tree → DOM |
| Component catalog lookup | Client browser | `node.type` → catalog | React component class |

**SEO prerender path:**
For search engine bots, the edge worker runs `renderElement` server-side via
React 19 `renderToPipeableStream()`, produces HTML, and caches it in KV. The
bot receives pre-rendered HTML. Human visitors get JSON and client-side hydrate.

### Client-Side Interactive Functions — API Calls from the Browser

Interactive components (add-to-cart, checkout, form submission) need functions
that run in the browser and call the API server. These are NOT part of the
json-render layout spec — they are **component-level behavior** defined in the
component catalog.

**Example: Add-to-cart button component**

The layout spec declares the button with a `$state` binding for the product ID.
The component code handles the click event and API call.

**Layout spec (designer defines where it goes):**
```jsonc
{
  "type": "AddToCartButton",
  "props": {
    "productId": { "$state": "productId" },
    "label":     { "$state": "formattedPrice" }
  }
}
```

**Component implementation (developer writes once, lives in R2 bundle):**
```typescript
function AddToCartButton({ productId, label }: { productId: string; label: string }) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    // Call the machines domain — the XState engine processes this
    const result = await fetch("/api/machines/cart/addToCart", {
      method: "POST",
      body: JSON.stringify({ productId, quantity: 1 })
    });
    const { cartCount } = await result.json();
    setLoading(false);
    // Update local state OR dispatch a client-side event
  }

  return (
    <button onClick={handleClick} disabled={loading}>
      {loading ? "Adding..." : label}
    </button>
  );
}
```

**What runs where:**

| Concern | Runs on | Example |
|---------|---------|---------|
| Layout structure | Designer defines in admin | "Put AddToCartButton below ProductInfo" |
| Component logic | Developer ships in R2 bundle | `handleClick` → `fetch("/api/machines/cart/addToCart")` |
| Render resolution | Edge worker | `$state.productId` → "prod_abc" |
| API call + state | Client browser | User clicks → POST → cart machine transitions → DOM updates |
| State machine | API server (machines domain) | `cart:addToCart` transition → validate → persist → return new state |

This separation means:
- Designers place interactive components in the layout spec without writing code
- Developers write the component logic once, ship it in the R2 bundle
- The edge resolves $state bindings (productId, price) from content data
- The browser runs the actual fetch/state/transition logic
- The machines domain on the API server processes the business logic

---

## Page Tree — URL Routing Layer

The page tree is a document type (`type: "page_tree"`, `key: "main"`) that maps
incoming URLs to the right content + layout combination. It separates URL routing
from content and layout concerns so each layer can evolve independently.

### Three-Layer Model

```
Layer 1: ROUTING (page_tree)
  URL slug → page ID. Locale-aware: different URL per locale.

Layer 2: PAGE IDENTITY (page document)
  Page ID → layout + content reference. Not locale-aware: same layout+content for all locales.

Layer 3: RENDER (layout + content)
  Layout spec (segment-resolved) + Content data (locale-resolved) → merged by edge worker.
```

### Concrete Example

**Tenant settings:**
```
locales: ["en-US", "fr"],  defaultLocale: "en-US"
```

**Page tree entry (`type: "page_tree"`, `key: "main"`):**
```
data: {
  pages: [
    {
      id: "pg-001",
      slug: { "en-US": "products/blue-sneakers", "fr": "produits/baskets-bleues" },
      pageId: "page-products"
    },
    {
      id: "pg-002",
      slug: { "en-US": "blog/summer-launch", "fr": "blog/lancement-ete" },
      pageId: "page-launch"
    }
  ]
}
```

The `url` field on each page entry is an `isLocalizable` field — each locale can
map a different URL path to the same page.

**Page document (`type: "page"`, `key: "page-products"`):**
```
data: {
  title:        { "en-US": "Our Products", "fr": "Nos Produits" },
  layoutRef:    "product_page",
  contentRef:   "product:blue-sneakers"
}
```

Layout and content references are NOT locale-aware. The same layout template and
content entry serve all locales. Locale-specific values come from the content
entry's `isLocalizable` fields.

**Request flow:**
```
1. GET https://store.fr/produits/baskets-bleues
   Accept-Language: fr

2. Page tree lookup:
     Find page where slug.fr === "produits/baskets-bleues" → pg-001 → pageId: "page-products"

3. Load page document "page-products":
     → layoutRef: "product_page", contentRef: "product:blue-sneakers"

4. Layout resolve:
     GET /api/documents/layout/product_page/resolve?segment=mobile
     → server-side deepMerge(default, overrides) → full spec → KV-cached

5. Content resolve (locale=fr):
     Load entry "product:blue-sneakers"
     isLocalizable fields → pick fr value with fallback to en-US (defaultLocale)
     non-isLocalizable fields → use as-is

6. Edge merges layout spec + resolved content + per-user $state → renders page
```

**Why three layers:**

| Concern | Layer | Locale-aware? | Change impact |
|---------|-------|---------------|---------------|
| URL → what to show | Page tree | Yes (different slug per locale) | Change URL without touching content |
| What to show → layout + content | Page document | No (same refs for all locales) | Change layout/content ref without touching URLs |
| How it looks | Layout (segment-resolved) | No | Publish new layout, all pages using it update |
| What it says | Content (locale-resolved) | Yes (isLocalizable fields) | Translate text without touching routing or layout |

### Content Type Schema for Page Documents

Page documents are content entries of type `"page"`. The system provides a
base definition. The tenant can extend it with additional fields.

```jsonc
{
  "name": "page",
  "schema": {
    "fields": [
      // Core routing fields (required)
      { "key": "title",      "isLocalizable": true,  "type": "text",    "required": true,  "label": "Page Title" },
      { "key": "layoutRef",  "isLocalizable": false, "type": "text",    "required": true,  "label": "Layout Template" },
      { "key": "contentRef", "isLocalizable": false, "type": "text",    "required": true,  "label": "Content Reference" },

      // SEO overrides (optional — tenant defaults kick in if not set)
      { "key": "meta",       "isLocalizable": false, "type": "json",    "required": false, "label": "SEO & OG Metadata" }
    ]
  }
}
```

`layoutRef` is the template name (e.g., `"product_page"`). `contentRef` is a
qualified reference `"contentType:entryKey"` (e.g., `"product:blue-sneakers"`).

### SEO Metadata — Tenant Defaults + Page Overrides

SEO metadata is NOT a per-page configuration burden. The tenant defines global
defaults in `tenant_settings`. Each page can optionally override specific fields
via the `meta` JSON field.

**Tenant defaults (`tenant_settings.data`):**
```jsonc
{
  "locales": ["en-US", "fr"],
  "defaultLocale": "en-US",
  "seo": {
    "metaTitleTemplate": "{{ title }} | Store Name",
    "metaDescription": "Default description for all pages",
    "ogImage":        { "assetId": "default_og_image" },
    "twitterCard":    "summary_large_image",
    "canonicalDomain": "https://store.com"
  },
  "integrations": {
    "googleAnalyticsId":  "G-XXXXXXXXXX",
    "facebookPixelId":    "1234567890",
    "hotjarId":           null,               // null = disabled
    "tiktokPixelId":      null
  }
}
```

**External service IDs (Google Analytics, Facebook Pixel, TikTok, Hotjar, etc.)**
live in `tenant_settings.integrations`, NOT in page content types. These are
tenant-level configuration injected by the edge worker at render time. Each
service ID is a flat key-value pair — null means disabled. Adding a new
service ID is a tenant_settings update, never a schema migration.

**Page-level override (`page.data.meta`):**
```jsonc
{
  "meta": {
    "seo": {
      "metaTitle":       "Custom Title for This Page",    // overrides tenant's template
      "metaDescription": "Specific description",          // overrides tenant's default
      "ogTitle":         "Custom OG Title",               // if not set, falls back to metaTitle → title
      "ogImage":         { "assetId": "page_og_image" }   // overrides tenant's default OG image
    },
    "noIndex": false,                                     // robots meta
    "canonicalPath": "/custom-path"                       // overrides tenant's canonicalDomain + this path
  }
}
```

**Resolution at render time:**
```
Edge worker resolving SEO for page "page-products" (locale: fr):

  1. Load tenant settings → default SEO config
  2. Load page meta overrides → page-level SEO
  3. Merge: tenant defaults → page overrides → final SEO tags

  Result:
    <title>Baskets Bleues | Store Name</title>           ← tenant template + page title (fr)
    <meta name="description" content="Specific description">
    <meta property="og:title" content="Custom OG Title">
    <meta property="og:image" content="https://r2.../page_og_image.webp">
    <link rel="canonical" href="https://store.com/custom-path">
```

Most pages never set `meta` — they inherit the tenant's defaults. Only pages
needing custom SEO (homepage, campaign landing pages) set overrides.

### External Service IDs — Tenant-Level, Not Page-Level

Google Analytics, Facebook Pixel, TikTok Pixel, Hotjar, and other third-party
tracking/service IDs are stored in `tenant_settings.integrations`. They are:

- **Tenant-level** — one config per tenant, shared across all pages
- **Injected at edge render time** — the edge worker reads `tenant_settings` and injects the appropriate `<script>` tags into the rendered HTML
- **Flat key-value** — each service has one ID. Null = disabled
- **Never in page content types** — pages don't carry analytics payloads

**Why not per-page tracking IDs:**

Pages should not own analytics configuration. A user with access to create/edit
pages should not be able to change the Google Analytics ID. Analytics tracking
is a tenant-level administrative concern.

**Analytics event capture (`analytics` domain):**

Separate from tracking IDs. The `analytics` domain captures page views,
conversions, and user behavior events from the edge worker and client-side SDK.
These events flow to ClickHouse for aggregation. The analytics domain subscribes
to domain events from all other domains for full attribution.

---

## Comparison with other open-source projects

| Project | Content Modeling | Rich Text | Assets | Schema-First |
|---------|-----------------|-----------|--------|-------------|
| **Contentful** (proprietary) | Content types + field definitions. Push schema → new type. Separate content, assets, and locales. | Rich Text (structured JSON, similar node/mark model). Embedded entries + assets. | Images API (auto-resize, WebP/AVIF). Asset model with lifecycle. | Yes — define content type schema first, then create entries. |
| **Payload CMS** (MIT) | Collection config in code (not DB). Fields + blocks. | Lexical rich text editor. Blocks for embedded references. | Upload collection with S3 adapter. Auto-resize via sharp. | Yes — collection config is the schema, defined in TypeScript. |
| **Strapi** (MIT) | Content-Type Builder (UI or JSON). Dynamic Zones for layout blocks. | Blocks rich text (Markdown or custom). | Media Library with S3/R2 provider plugin. Responsive images via sharp. | Yes — define in admin UI, stored in DB. |
| **Sanity** (MIT) | Schema defined in JS/TS code. Field types + validation. | Portable Text (structured JSON, predecessor to Contentful Rich Text). | Asset pipeline with transformations (hotspot, crop). CDN via Sanity's asset CDN. | Yes — schema in code. |
| **WordPress + Gutenberg** (GPL) | Custom post types in PHP. Taxonomies + meta fields. | Gutenberg blocks (React components). Serialized HTML comments. | Media Library. Auto-resize to registered image sizes. | Sort of — custom post types are the schema, but no field-level validation. |

Our `documents` domain follows the **Contentful pattern**:
- Schema-first content types stored in `documentTypes` (DB, not code)
- Field-level type catalog with primitives (text, number, rich text, media, reference)
- Rich text as structured JSON (not HTML, not Markdown)
- Asset management on Cloudflare R2 with auto-generated responsive variants
- Field-level read/write permissions
- All inside one domain with a type registry, avoiding N-domain duplication

---

## Build plan — DONE (Phase 0) + NEXT (Phase 1)

### Phase 0 (implemented):

1. `documents/ports.ts` — `DocumentStorage` type-registry interface + separate
   content/layout ports.
2. `documents/entity.ts` — `ContentDocument` and `LayoutDocument` aggregates, separate
   event namespaces.
3. `documents/schema.ts` — Unified `documents` table (type, key, segment, version,
   status, data JSONB) + `documentTypes` table (schema registry).
4. `documents/service.ts` — `content` + `layout` namespaces; create / add-variant /
   publish. Variant creation stores overrides (not full copy) for non-default segments.
   `resolve` deep-merges `default + overrides` and returns full spec.
5. `documents/adapters/postgres.ts` — Full Postgres adapter implementing
   `DocumentStorage`. Non-default variants store `data.overrides` + `data.baseVersion`;
   default stores `data.spec`.
6. `documents/api.ts` — Generic `/api/documents/:type` routes dispatched by
   `TypeHandler`. Content type routes at `/api/documents/content-types`.
   `resolve` endpoint returns full merged JSON, never raw overrides.

### Phase 1 — Content modeling + rich text + assets (MOSTLY DONE):

1. ✅ **Real content validation** — Zod-based validator reads `documentTypes.schema`,
   generates Zod schemas from field definitions, validates content entries on
   create/update. Field-level permissions filter fields on read (`filterReadFields`)
   and reject unauthorized writes (`validateFieldWritePermissions`). Caller role
   passed via `?role=` query param.
2. ✅ **Rich text schema + validation** — `richtext.ts` defines `RichTextDocument`
   type with Zod schemas for the full node/mark tree. Rich text field type in
   validator. Per-field node type and mark allowlists via `constraints.allowedNodeTypes`
   and `constraints.allowedMarks`.
3. ✅ **Content type schema management routes** — `/api/documents/content-types`
   CRUD wired. Schema update does NOT retroactively validate existing entries.
4. ✅ **Asset upload endpoint** — `POST /api/documents/assets/upload` (multipart).
   SHA-256 hash deduplication via `findByHash` (returns existing asset on match).
   Uploads to Cloudflare R2 via S3 API. Non-image files uploaded to R2 as-is.
5. ✅ **Image processing pipeline** — Responsive variants (thumbnail/small/medium/large)
   via sharp. WebP and AVIF generated per variant (skipped for SVG/GIF).
   Focal point passed for content-aware cropping. Variant metadata in asset `data`.
6. ❌ **Video processing integration** — NOT IMPLEMENTED. Cloudflare Stream
   upload + transcoding pipeline deferred.
7. ✅ **Asset CRUD routes** — GET/PUT/DELETE/ARCHIVE/PUBLISH wired. `_resolved`
   block in API responses enumerates all variant URLs on read. Archive is soft
   delete (status → "archived", R2 object retained).
8. ❌ **Edge asset resolution** — NOT IMPLEMENTED. Belongs in Cloudflare Worker
   edge package, not the API server documents domain.
9. ❌ **Rich text rendering in json-render** — NOT IMPLEMENTED. Belongs in
   json-render runtime/client package, not the API server documents domain.

### Phase 1 divergences from original design:

- **ID-based routing.** Content entries are identified by their internal UUID
  (`documents.id`). The `key` column for content rows equals `id`. No URL slug
  generation. Routes are `/:type/:id` not `/:type/:key`. This simplifies the
  API and removes the `keyFromData` slug logic.
- **Asset upload dedup.** `findByHash` checks for existing assets by SHA-256
  before upload, not only in the service layer but at the storage query level
  (`documents.data->>'hash'`).
- **`layout.variant_created` event.** Emitted via `eventBus.publish` when
  `addVariant` creates a new layout segment variant.

### Future (Phase 2+):

- **Video processing (Cloudflare Stream)** — On asset upload (type `video/*`),
  upload to Cloudflare Stream via Stream API. Poll for transcoding completion.
  Store Stream video UID + HLS playback URL in asset data.
- **Content type versioning** — Version the schema itself. Existing entries remain
  validatable against the schema version they were created with.
- **Asset tags + search** — Tag assets, search/filter by tag, MIME type, dimensions.
- **Bulk asset operations** — Batch upload, batch delete, batch tag.
- **AI content generation integration** — Agent domain calls AI pipeline to generate
  content entries conforming to a content type schema. AI generates rich text trees
  with embedded assets.
- **Diff/patch for rich text** — Operational transform or CRDT for collaborative
  rich text editing. `@json-render/core` `diffToPatches()` on the rich text tree.
- **Content type migration tooling** — When a schema changes, provide migration
  scripts to transform existing entries to the new schema (add default values, remove
  fields, convert field types).

---

## Schema (Updated for Assets)

The `documents` table is already generic (one table, type discriminator). Assets are
rows with `type: "asset"`. No new table needed.

```
documents table:
  id              UUID PK (default random)
  tenant_id       UUID NOT NULL
  type            TEXT NOT NULL        ← "content" | "content_type" | "page" | "page_tree" | "tenant_settings" | "asset" | "layout" | "backend-logic"
   key             TEXT NOT NULL        ← For content: equals `id` (UUID, no slug). For layout: templateName. For asset: assetId (UUID). For tenant_settings: "default". For page_tree: "main".
  version         INT NOT NULL DEFAULT 1
  segment         TEXT NOT NULL DEFAULT 'default'
  status          ENUM('draft','published','archived')
  base_version    INTEGER              ← default's version that a non-default variant's overrides are based on. Used for conflict detection when default structure changes.
  data            JSONB NOT NULL       ← type-specific payload (full spec for default, overrides dict for non-default variants)
  meta            JSONB DEFAULT '{}'
  created_at      TIMESTAMP
  updated_at      TIMESTAMP
```

The `documentTypes` table holds content type schemas:

```
document_types table:
  id              UUID PK
  tenant_id       UUID NOT NULL
  name            TEXT NOT NULL        ← "product", "page", "blog", "faq"
  schema          JSONB NOT NULL       ← { fields: [...], ... }
  created_at      TIMESTAMP
```

Adding a content type: `INSERT INTO document_types (tenant_id, name, schema) VALUES (...)`
Adding a field to a content type: `UPDATE document_types SET schema = jsonb_set(...)`
No migration. No deploy. Content entries for that type are validated on next write.

---

## Summary — What This Domain Owns

| Concern | Where | How |
|---------|-------|-----|
| Content type schema definition | `documentTypes.schema` JSONB | Field catalog with types + constraints + permissions |
| Content entries | `documents` (type: content) | Validated against content type schema. Draft/published/archived. |
| Page documents | `documents` (type: page) | Links page identity to layout template + content entry reference. |
| Entry identity | `documents.id` column | UUID, stable, immutable. Content entries identified by `id` in all CRUD routes (`/:type/:id`). No URL slug generation. |
| Page tree routing | `documents` (type: page_tree) | Maps URL paths to page IDs. Locale-aware slugs. Three-layer model: routing → page → layout+content. |
| Tenant config | `documents` (type: tenant_settings) | Per-tenant: locales, defaultLocale, SEO defaults, external service IDs (GA, FB Pixel). |
| Rich text fields | `documents.data` (type: richText) | Structured JSON tree (nodeType + marks). Per-field node/mark allowlists via `constraints`. |
| Asset upload + storage | Cloudflare R2 | Multipart upload → hash dedup (`findByHash`) → variant generation → asset doc row. |
| Image variants | R2 (`{tenantId}/{hash}/`) | Thumbnail/small/medium/large + WebP/AVIF per size. Generated by `sharp`. Focal point cropping supported. |
| Video transcoding | Cloudflare Stream | Upload → HLS transcoding → playback URL stored in asset data. |
| Asset references in content | `documents.data` (type: media/mediaList) | Asset IDs resolved to R2 variant URLs at read/render time. |
| Layout templates | `documents` (type: layout) | json-render spec. Default stores full spec. Non-default variants store overrides only; `resolve` deep-merges default + overrides → full spec. |
| Variant inheritance | `resolve` endpoint + `baseVersion` | Non-default variants store overrides only. `deepMerge(default, overrides)` on server, returns full spec through API, KV-caches merged result. `baseVersion` detects conflicts when default structure shifts under a variant's override paths. |
| Segment definition | `segments` table (context domain) | Behavior-based conditions per tenant (purchases, visits, engagement). Finite taxonomy (10-100 max). NOT locale, NOT device type. |
| Segment resolution | `context_cache` (visitorId→segment) | Behavior signals from analytics/session data. Per-tenant. |
| KV edge cache | Cloudflare Workers KV | Keys include tenantId. Per-segment layout + per-key content + prerendered HTML. |
| Per-user personalization | json-render `$state` bindings | Injected at edge render time from JWT/cart/recommendations. NOT part of segment hash. NOT cached by segment. |
| Field permissions | `documentTypes.schema.fields[].permissions` | read/write arrays of role strings. Enforced by service layer. |
| Locale configuration | `documents` (type: tenant_settings) | Per-tenant locale list + default locale. One source of truth. |
| Locale validation | `ContentValidator` → tenant settings | Rejects writes with `?locale=X` when X is not in tenant's `locales` list. |
| isLocalizable fields | `documentTypes.schema.fields[].isLocalizable` | When true: field accepts per-locale values via `?locale=X` writes. Values accumulate as `{ "en-US": ..., "fr": ... }`. When false: plain value shared across all locales. |
| Client component catalog | R2 bundle + `tenant_settings.components` | Core components in shared bundle. Per-tenant custom components registered via URL. Loaded lazily per page type usage. |
| Validation | `ContentValidator` → Zod | Schema-driven. Generated from content type field definitions. |
| Publishing | Status transition | draft → published emits domain event. published cache invalidated per type. |
| Events | Per-type event namespaces | `content.*`, `content_type.*`, `page.*`, `page_tree.*`, `tenant_settings.*`, `asset.*`, `layout.*`, `backend-logic.*` |
