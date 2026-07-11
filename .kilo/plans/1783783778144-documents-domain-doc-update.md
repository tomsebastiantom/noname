# Plan: Finalize documents-domain.md Design Document

## Goal

Update `docs/2026-07-10/documents-domain.md` to reflect all finalized design decisions. The doc is the single source of truth for content modeling, rich text, assets, variants, segments, locales, and page routing.

## Precise Edit Instructions

### 1. Field Type Catalog (line 67-83)

**Remove** the `slug` row entirely:
```
| `slug` | string | URL-safe identifier, auto-generated from `title` field. |   ← DELETE THIS ROW
```

Keep all other rows. `slug` is NOT a field type merchants define. The system auto-generates a `key` (URL slug) from the first `isLocalizable` text field. Explain this in a note below the catalog table.

### 2. Content Type Schema Example — First Instance (line 38-63)

**Replace** the full content type schema example. Changes:
- Remove the `slug` field definition line entirely
- Replace `localized: true/false` → `isLocalizable: true/false` on every field

### 3. Content Type Schema Example — Second Instance (line 114-131)

**Replace** similarly — remove `slug` field, use `isLocalizable`.

### 4. Entry Data Storage Example (line 93-105)

**Remove** the `"slug": "blue-sneakers"` line. Entry identity lives in the `key` column, not in `data`.

### 5. Field Type Catalog Note (after line 83, before line 85)

**Add** after the catalog table:
```
Entry identity (`key` column): Every content entry gets a system-assigned `key` — a
URL-safe identifier auto-generated from the first `isLocalizable` text field. The
key is stable across locales and is NOT a configurable field in the content type
schema. Merchants never define a `slug` field.
```

### 6. Locale Section (lines 85-253)

**Complete rewrite.** Current content has `localized: true/false` everywhere. Must be replaced with:
- `isLocalizable: true/false` on all field definitions
- Tenant-level locale config: one `tenant_settings` row (type: `"tenant_settings"`, key: `"default"`)
- API writes target one locale via `?locale=XX`
- Validation flow: check tenant's enabled locales → accept/reject
- Locale removal: new writes rejected, existing data retained
- Option A (per-content-type) vs Option B (per-tenant) comparison with explanation why B was chosen
- All examples use `isLocalizable`

### 7. Locale Resolution Flow (lines 122-140)

**Replace** with updated resolution that references tenant's locales:
```
Visitor request → Accept-Language header → extract locale
  → Check tenant's enabled locales → locale must be in list
  → For isLocalizable fields, pick locale value with fallback: locale → defaultLocale → first available
  → For non-isLocalizable fields, use value as-is
```

### 8. Variant Inheritance Header (line 675)

**Replace** `## Variant Inheritance — Override Model (Phase 2)` → `## Variant Inheritance — Override Model (Core Design)`

Also **remove** all "(Phase 2)" labels in:
- Schema section column descriptions
- Summary table rows
- Any other location

### 9. Schema Section (lines ~855-876)

**Replace** the schema column descriptions:
- Remove `parent_version` entirely
- Add `base_version INTEGER` as core column with description
- Update `data` description to reflect override model

### 10. KV Cache Key References (lines 601, 795, 803, 804, 1060)

- Lines 601, 803: Replace `content by slug` → `content by key`
- Lines 795, 804: No change (HTML cache includes `:slug` in the key — this is the URL path, not a field type)
- Line 1060: Replace `per-slug content` → `per-key content`

### 11. Page Tree — NEW Section

**Insert** between "Segment Fallback Resolution" and "Comparison with other open-source projects" (after line ~669):

```
## Page Tree — URL Routing Layer

The page tree is a document type (`type: "page_tree"`, `key: "main"`) that
maps incoming URLs to the content + layout combination to render. It separates
URL routing from content and layout concerns.

### Three-Layer Model

Layer 1 — Routing (page_tree): URL → page ID. Locale-aware slugs.
Layer 2 — Page identity (page doc): Page ID → layout + content reference.
Layer 3 — Render (layout + content): Layout spec merged with content data.

[Concrete example from our discussion: routing entry, page entry,
layout resolve, content resolve with locale, edge merge flow]
```

### 12. Build Plan Section (lines ~790-852)

Update Phase 0 items to reference: override model as core, `baseVersion`, tenant-level locale settings.

### 13. Summary Table (lines ~896-912)

**Add rows**:
```
| Locale configuration | documents (type: tenant_settings) | Per-tenant locale list + default locale. |
| isLocalizable fields | documentTypes.schema.fields[].isLocalizable | When true: per-locale values. When false: shared value. |
| Entry identity | documents.key column | System-assigned URL slug. Auto-generated from title. Not in schema. |
| Page tree routing | documents (type: page_tree) | Maps URL paths to page IDs. Locale-aware slugs. Three-layer model. |
| Variant inheritance | resolve endpoint + baseVersion | Override model. Default stores full spec, variants store diffs. Server-side merge. |
```

**Remove** "Phase 2" from existing layout rows.

### 14. Comparison Table (line ~908)

Add a "Locale" column to the comparison table.

## Validation Checklist

After edits, verify:
- [ ] No `localized: true` or `localized: false` anywhere in the doc
- [ ] No `slug` as a field type in the catalog table or schema examples
- [ ] No `parentVersion` or `parent_version` anywhere
- [ ] No "(Phase 2)" on variant inheritance
- [ ] `isLocalizable` used consistently in all field definitions
- [ ] `baseVersion` in schema section and conflict detection section
- [ ] Tenant-level locale model explained with Option A/B table
- [ ] Page tree section exists with three-layer concrete example
- [ ] Summary table has locale, isLocalizable, page tree, and variant inheritance rows
- [ ] Comparison table includes locale column
