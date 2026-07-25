# Content Render Pipeline — CMS to Resolved Spec

> **Date:** 2026-07-25  
> **Status:** **Build next** (Step 1 in [`ARCHITECTURE-MAP.md`](./ARCHITECTURE-MAP.md))  
> **Related:** [`documents-domain.md`](../2026-07-10/documents-domain.md), [`EXTENSION-LIFECYCLE.md`](./EXTENSION-LIFECYCLE.md)

---

## Goal

Storefront text and data live in **CMS content entries**. Layout templates define **structure** with `$state` slots. The **edge** merges content into the spec before the client renders — same model as Contentful + a theme template.

**Login pages are excluded** — they use layout props directly ([`LOGIN-UI.md`](./LOGIN-UI.md)).

---

## Target flow

```
1. Merchant writes content     POST /api/documents/product  (CMS entry)
2. Designer writes layout        layout spec with { "$state": "title" } slots
3. Page links them (optional)    page document: layoutRef + contentRef
4. Browser requests page         GET /api/edge/schema/:orgId?template=home&contentRef=product:ID
5. Edge resolves
     a. layout.resolve(template, segment)
     b. content.resolve(type, id, locale)
     c. merge into $state
     d. resolveElementProps(spec, $state)   ← @json-render/core
6. Client receives resolved JSON           literal props, no $state refs
7. Renderer draws components
```

---

## Two paths for prop values

| Binding | Example | Source |
|---------|---------|--------|
| **Literal in layout** | `"ctaLabel": "Explore"` | Layout spec (structure / marketing chrome) |
| **`$state` slot** | `"title": { "$state": "title" }` | Content entry field |

Commerce demo **today** uses literals for product text — a seed shortcut. **Target:** product fields from content entry.

---

## Document types involved

| Type | Role | API |
|------|------|-----|
| `content_type` | Schema for product, page, blog… | `POST /api/documents/content-types` |
| `content` | Business data (title, price…) | `POST /api/documents/:type`, `GET .../:id/resolve` |
| `layout` | json-render template | `POST /api/documents/layout`, `layout.resolve` |
| `page` | Links layout + content | `page.data.layoutRef`, `contentRef` |
| `page_tree` | URL → page id | `GET /api/documents/page_tree/resolve?url=` |
| `tenant_settings` | Locales, SEO defaults | Merged at resolve time |

Full model: [`documents-domain.md`](../2026-07-10/documents-domain.md) § “How json-render Renders a Page”.

---

## Example (target commerce home)

**Content entry** (`product`, published):

```json
{
  "productId": "demo-sneakers",
  "title": "Blue Sneakers",
  "price": 99.99,
  "description": "Comfortable running shoes.",
  "image": null
}
```

**Layout spec** (`home` template):

```json
"product1": {
  "type": "ProductCard",
  "props": {
    "productId": { "$state": "productId" },
    "title": { "$state": "title" },
    "price": { "$state": "price" },
    "description": { "$state": "description" },
    "image": { "$state": "image" }
  }
}
```

**After edge resolve** (what client receives):

```json
"product1": {
  "type": "ProductCard",
  "props": {
    "productId": "demo-sneakers",
    "title": "Blue Sneakers",
    "price": 99.99,
    "description": "Comfortable running shoes.",
    "image": null
  }
}
```

---

## Implementation checklist

### Backend (exists)

- [x] `content.create` / `content.resolve` — locale-aware field pick
- [x] `layout.resolve` — default + segment overrides
- [x] `pages.resolveByUrl` — slug routing
- [x] Edge `GET /schema/:siteId?template=&segment=`

### Backend (to build — Step 1)

- [ ] Edge: accept `contentRef=type:id` and `locale` query params
- [ ] Edge: load content via `content.resolve`, build `$state` object
- [ ] Edge: walk spec tree, `resolveElementProps` per element (`@json-render/core`)
- [ ] Optional: read `contentRef` from page document when URL routing wired
- [ ] Optional: layout `data.contentRef` default for template-level binding

### Seeds / demo

- [ ] `seed-demo-commerce`: create `product` content type + published entry
- [ ] Layout uses `$state` bindings, not inline `"Blue Sneakers"`
- [ ] Seed validates edge returns resolved product title

### Client

- [x] `Renderer` accepts resolved spec (no change if edge sends literals)
- [ ] Pass `contentRef` or rely on page routing when added

---

## What NOT to do

| Anti-pattern | Why |
|--------------|-----|
| Put product copy only in layout JSON | Bypasses CMS; merchants re-publish layout to fix a typo |
| Put login password fields in content CMS | Auth is layout props + server broker |
| Resolve `$state` in every React component | Edge resolves once; client stays dumb |
| One giant JSON blob for layout + all products | See documents-domain — separate document types |

---

## Status vs documents-domain.md

[`documents-domain.md`](../2026-07-10/documents-domain.md) is the **full CMS specification** (1000+ lines). This doc is the **implementation tracker** for the edge merge step. When Step 1 is done, update the status line at the top to ✅.

---

## References

- `packages/server/src/domains/edge/service.ts` — add resolve step here
- `packages/server/src/domains/documents/service.ts` — `content.resolve`, `layout.resolve`
- `scripts/seed-demo-commerce.ts` — update to content entry + `$state`
- [`ARCHITECTURE-MAP.md`](./ARCHITECTURE-MAP.md) — build order
