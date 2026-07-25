# Page Routing — URL → Spec (Implementation Plan)

> **Date:** 2026-07-25  
> **Status:** **Implemented** (2026-07-25) — seed, edge `?url=`, client split, admin UI, commerce URL  
> **Related:** [`SPEC-DRIVEN-UI.md`](./SPEC-DRIVEN-UI.md), [`CONTENT-RENDER-PIPELINE.md`](./CONTENT-RENDER-PIPELINE.md), [`documents-domain.md`](../2026-07-10/documents-domain.md) § Page Tree

---

## Problem (today)

Storefront and admin URLs are resolved in **React**, not documents:

```typescript
// packages/client/src/main.tsx — temporary, causes drift
function templateFromPath(pathname: string): string {
  if (pathname.startsWith("/admin/content")) return "admin_content";
  if (pathname === "/") return "home";
  // ...
}
```

Client then calls:

```
GET /api/edge/schema/{orgId}?template=home&segment=default
```

**Merchant URLs are not in CMS.** Adding `/about` or `/products/shoes` requires a code change. That breaks the spec-driven model in [`SPEC-DRIVEN-UI.md`](./SPEC-DRIVEN-UI.md).

Admin APIs and content CMS are fine — the gap is **routing**, not admin forms.

---

## Target (already designed)

Full data model: [`documents-domain.md`](../2026-07-10/documents-domain.md) § Page Tree.

```
Browser URL
    │
    ▼
page_tree document     URL slug → pageId (locale-aware)
    │
    ▼
page document          layoutRef + contentRef
    │
    ▼
edge getSchema         layout.resolve + content.resolve → merged spec
    │
    ▼
json-render Renderer   same pipeline as today
```

**Every merchant page** = resolved spec from edge. No React route table for storefront paths.

---

## Two routing scopes (do not merge)

| Scope | Who owns URLs | Resolution | Stays in code? |
|-------|---------------|------------|----------------|
| **Platform** | Noname | Fixed paths | Yes — small map in `main.tsx` |
| **Merchant storefront** | Tenant | `page_tree` + `page` docs | No — move out of React |

### Platform routes (keep in `main.tsx`)

These are **not** merchant CMS — exceptions by design:

| Path | Template / handler | Why code |
|------|-------------------|----------|
| `/login`, `/auth/callback` | `login` / callback page | OAuth |
| `/admin`, `/admin/*` | `admin_home`, `admin_content`, … | Core dashboard |
| `/api/*` | proxy | Infrastructure |

### Merchant routes (move to documents)

| Path | Stored in | Example |
|------|-----------|---------|
| `/` | `page_tree` → `page` | home layout + optional contentRef |
| `/about` | `page_tree` → `page` | custom layout + page content |
| `/products/blue-sneakers` | `page_tree` → `page` | product layout + `product:uuid` |

Locale-specific URLs (e.g. `/fr/produits/...`) use **locale-keyed slugs** on `page_tree` entries — see documents-domain.

---

## Best implementation (current codebase)

Minimal change: **extend edge**, **thin client**, **seed routing docs**. Do not add react-router.

### Step 1 — Seed routing documents

In `scripts/seed-demo.ts` (or admin UI later):

```typescript
// page_tree (type: page_tree, key: main)
{
  pages: [
    { id: "pg-home", slug: { "en-US": "/" }, pageId: "page-home" }
  ]
}

// page (type: page, key: page-home)
{
  title: { "en-US": "Home" },
  layoutRef: "home",
  contentRef: null   // or "page:uuid" when CMS-driven
}
```

API already exists: `GET /api/documents/page_tree/resolve?url=&locale=`.

### Step 2 — Edge: resolve URL → schema

Extend `GET /api/edge/schema/:orgId`:

**Today:** `?template=home&segment=default`

**Add:** `?url=/about&locale=en-US&segment=default`

```
if (options.url) {
  route = pages.resolveByUrl(orgId, url, locale)
  template = route.layoutRef
  contentRef = route.contentRef
} else if (options.template) {
  // backward compat + admin/login
}
return getSchema(orgId, { template, contentRef, segment, locale })
```

File: `packages/server/src/domains/edge/service.ts`  
Route: worker proxy already forwards query string.

### Step 3 — Client: call edge by URL, not template

Replace storefront branch of `templateFromPath`:

```typescript
// Platform paths only
if (isPlatformPath(pathname)) {
  return { mode: "template", template: platformTemplateFromPath(pathname) };
}
// Merchant storefront
return { mode: "url", url: pathname, locale: detectLocale() };
```

Fetch:

```
GET /api/edge/schema/{orgId}?url={pathname}&segment=default&locale=en-US
```

**Remove** hardcoded `return "home"` for unknown storefront paths — 404 from edge if no `page_tree` match.

### Step 4 — Admin for routing (Phase C+)

Spec-driven admin component (same pattern as `ContentEntryAdmin`):

| Component | Edits |
|-----------|-------|
| `PageTreeAdmin` | `page_tree` entries (slug → pageId) |
| `PageEntryAdmin` | `page` docs (layoutRef, contentRef) |

Or generic content admin once `page` and `page_tree` are registered content types / document UIs.

### Step 5 — Validate

```bash
pnpm seed:demo   # includes page_tree + page for /
curl "/api/documents/page_tree/resolve?url=/&locale=en-US"
curl "/api/edge/schema/{orgId}?url=/&segment=default"
# Browser: http://{orgId}.localhost:5173/ → same as today, no templateFromPath for /
```

---

## What stays where (quick reference)

| Concern | Document / layer | Not |
|---------|------------------|-----|
| URL → which page | `page_tree` | `main.tsx` for storefront |
| Which layout + content | `page` | Hardcoded template name |
| Page structure (components) | `layout` | React page |
| Copy / product fields | `content` | Layout JSON literals |
| Admin dashboard URLs | Platform `templateFromPath` | page_tree |
| Login URLs | Platform `login` template | CMS |

---

## Anti-patterns

| Wrong | Right |
|-------|-------|
| Add storefront paths to `templateFromPath` | Add `page_tree` entry |
| react-router for merchant pages | Edge URL resolve |
| Bake `/about` title in layout spec | `content` entry + contentRef on page doc |
| Put admin routes in `page_tree` | Keep `/admin/*` as platform templates |
| New edge endpoint per page type | One `getSchema` with url **or** template |

---

## Build order (recommended)

```
✅ 1. Seed page_tree + page for /
✅ 2. Edge getSchema accepts ?url= + locale
✅ 3. Client: platform vs merchant path split
✅ 4. Remove templateFromPath for storefront
✅ 5. Admin UI for page_tree / page (`/admin/pages`, `/admin/pages/tree`)
✅ 6. Commerce product URLs in page_tree (`seed-demo-commerce`)
```

Phase D ties in: [`PHASE-3-STORE-SLUG.md`](./PHASE-3-STORE-SLUG.md) (hostname → org) is **orthogonal** — this doc is **path → page** within an org.

---

## References

- [`documents-domain.md`](../2026-07-10/documents-domain.md) — page_tree schema, three-layer model
- [`CONTENT-RENDER-PIPELINE.md`](./CONTENT-RENDER-PIPELINE.md) — layout + contentRef merge on edge
- [`SPEC-DRIVEN-UI.md`](./SPEC-DRIVEN-UI.md) — catalog + Renderer (unchanged)
- Code today: `packages/client/src/main.tsx`, `packages/server/src/domains/documents/service.ts` (`pages.resolveByUrl`), `packages/server/src/domains/edge/service.ts`
