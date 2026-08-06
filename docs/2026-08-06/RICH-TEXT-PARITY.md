# R1.1 — Rich text OSS parity & gap analysis

> **Date:** 2026-08-06  
> **Status:** R1 + R1.1 + **R1.2/R1.3 shipped** — TipTap, embed resolve, constraints toolbar, tables, video, paste hardening, email channel  
> **Baseline doc:** [`RICH-TEXT-IMPLEMENTATION.md`](./RICH-TEXT-IMPLEMENTATION.md)

---

## What we ship now (R1 → R1.3)

| Capability | Status | Implementation |
|------------|--------|----------------|
| Inline JSON on content entry | ✅ | `richText` field in `documents.data` |
| Server validation (node/mark tree) | ✅ | `@noname/documents` + `validator.ts` |
| Admin + visual editor field | ✅ | TipTap WYSIWYG (`RichTextTipTapEditor`) |
| HTML paste (via TipTap) | ✅ | Browser paste → schema → `RichTextDocument` |
| Paste sanitization | ✅ | `PasteSanitize` strips scripts/styles/on* handlers |
| Bold / italic / underline / link | ✅ | TipTap marks → our marks / `hyperlink` nodes |
| Headings, lists, quote, code, HR | ✅ | StarterKit + bridge |
| **Tables** | ✅ | `table` / `table-row` / `table-cell` + TipTap table ext |
| Embedded asset block | ✅ | `embedded-asset-block` + asset picker |
| Embedded entry block | ✅ | `embedded-entry-block` + entry picker |
| **Inline asset / entry embeds** | ✅ | `embedded-asset-inline`, `embedded-entry-inline` |
| **Video embed block** | ✅ | `embedded-video-block` + asset picker |
| **Resolve embeds at render** | ✅ | `resolveRichTextFieldValue` → `_resolved` on targets |
| **Constraint-driven toolbar** | ✅ | `field.constraints` → `richTextToolbarFlags` |
| Storefront render | ✅ | `RichTextRenderer` (images, video, tables, inline) |
| Bot SSR HTML | ✅ | `richTextToHtml()` + resolved URLs in `bot-ssr.ts` |
| **Email channel (HTML + plain text)** | ✅ | `renderRichTextForEmail` + `{key}_html` / `{key}_text` in notification vars |
| **Search indexing** | ✅ | `meta.searchText` from `richTextToPlainText` + text fields on write |
| `$state` CMS binding in layout | ✅ | Existing props panel path |

---

## OSS comparison (headless CMS rich text)

| Feature | Contentful | Sanity | Payload | Strapi | **noname (now)** |
|---------|------------|--------|---------|--------|------------------|
| Structured JSON (not HTML storage) | ✅ | ✅ (Portable Text) | ✅ (Lexical JSON) | ✅ | ✅ |
| WYSIWYG admin | ✅ | ✅ | ✅ | ✅ | ✅ TipTap |
| Paste from Word/web | ✅ | ✅ | ✅ | ✅ | ✅ (TipTap; fidelity varies) |
| Embed asset in body | ✅ | ✅ | ✅ | ✅ | ✅ block + inline |
| Embed entry in body | ✅ | ✅ | ✅ | ✅ / blocks | ✅ block + inline |
| Resolve embeds at render | ✅ | ✅ | ✅ | ✅ | ✅ `_resolved` on resolve API |
| Per-field node allowlist | ✅ | ✅ | ✅ | ✅ | ✅ schema `constraints` → toolbar |
| Tables | ✅ | ✅ | ✅ | ✅ | ✅ |
| Localized rich text | ✅ | ✅ | ✅ | ✅ | ✅ `isLocalizable` |
| Live collab | ❌ native | ✅ | ✅ plugin | ✅ | ❌ **D7** (Yjs) deferred |
| Version history UI | ✅ | ✅ | ✅ | ✅ | ⚠️ `document_ops` audit only |
| AI assist in editor | add-on | ✅ | emerging | plugins | ❌ future |

---

## Gap matrix — remaining work

Priority: **P0** = blocks common CMS workflows · **P1** = expected soon · **P2** = nice / scale

| ID | Gap | P | Status | Notes |
|----|-----|---|--------|-------|
| **RT-1** | Resolve embedded assets at render | P0 | ✅ | `richtext-field-resolve.ts` + renderer `<img>` |
| **RT-2** | Resolve embedded entries at render | P0 | ✅ | Batch ref resolve + labels in renderer |
| **RT-3** | Constraint-driven toolbar | P1 | ✅ | `richTextToolbarFlags` + `field.constraints` |
| **RT-4** | Inline asset embed | P1 | ✅ | TipTap + renderer |
| **RT-5** | Inline entry embed | P1 | ✅ | TipTap + renderer |
| **RT-6** | Paste sanitization policy | P1 | ✅ | `PasteSanitize` extension |
| **RT-7** | Email plain-text + safe HTML | P1 | ✅ | `renderRichTextForEmail` in notification vars |
| **RT-8** | Search / excerpt | P1 | ✅ | `buildContentSearchText` → `meta.searchText`; `GET /:type/search?q=` |
| **RT-9** | Live collab on rich fields | P2 | ❌ | **D7**: Yjs + Hocuspocus |
| **RT-10** | AI generate field | P2 | ❌ | Agent pipeline → valid `RichTextDocument` |
| **RT-11** | Video embed block | P2 | ✅ | `embedded-video-block` |
| **RT-12** | Table block | P2 | ✅ | TipTap table + node types |

---

## Recommended roadmap (updated)

### Done — R1.2 render parity

- RT-1 + RT-2: resolve API deep-walks rich text embeds  
- `RichTextRenderer` shows images, entry teasers, video  
- Bot SSR uses resolved asset URLs in `richTextToHtml`

### Done — R1.3 editor polish

- RT-3: constraints → toolbar  
- RT-6: paste sanitization  
- RT-4/5: inline embeds  
- RT-11/12: video + tables  
- RT-7: email `{var}_html` / `{var}_text`

### Phase D7 — Collab (only if asked)

- TipTap Collaboration + Yjs + Hocuspocus  
- Same storage format — no migration  

---

## What we deliberately skip

| Skip | Why |
|------|-----|
| HTML as source of truth | XSS + multi-channel loss |
| Separate rich-text document type | Inline field is OSS standard |
| Automerge for rich text | Yjs is the right CRDT for text |
| Full Word-perfect paste v1 | TipTap paste + RT-6 sanitize is enough for v1 |

---

## Test checklist

```bash
pnpm vitest run packages/documents/src/content-search.test.ts
pnpm vitest run packages/server/src/domains/documents/services/content.service.test.ts
pnpm --filter @noname/client typecheck
pnpm --filter @noname/server typecheck
```

Manual:

1. Admin → product description: paste formatted text; confirm no script tags survive  
2. Insert table, video, inline asset/entry; save  
3. `GET .../resolve` returns `_resolved` on embed nodes  
4. Storefront shows image/video/table  
5. Notification template with `$state` `/body_html` renders rich text variable  

---

## Doc links

| Doc | Role |
|-----|------|
| [`RICH-TEXT-IMPLEMENTATION.md`](./RICH-TEXT-IMPLEMENTATION.md) | R1 build plan |
| [`documents-domain.md`](../2026-07-10/documents-domain.md) | Node/mark model |
| [`DOCUMENT-REFS.md`](../2026-07-25/DOCUMENT-REFS.md) | Embed ref rules |
| [`BUILD-MASTER-INDEX.md`](./BUILD-MASTER-INDEX.md) | Backlog IDs |

---

*Last updated: 2026-08-06 — R1 complete including RT-8 search indexing.*
