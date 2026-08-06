# R1 — Rich text implementation plan

> **Date:** 2026-08-06  
> **Status:** **Not started** (server schema only)  
> **Track ID:** **R1** in [`BUILD-MASTER-INDEX.md`](./BUILD-MASTER-INDEX.md)  
> **Related:** [`documents-domain.md`](../2026-07-10/documents-domain.md) § Rich Text · **not** E3 collab ([`E3-SPIKE-REPORT.md`](./E3-SPIKE-REPORT.md))

---

## Executive summary

**Today:** Layout and CMS copy are edited as plain **`text`** / **`longText`** strings in the visual editor props panel and admin forms. The platform **defines** a `richText` content-type field and validates `RichTextDocument` JSON on the server, but **nothing in the client reads or writes that shape**.

**Goal (R1):** End-to-end rich text for CMS content entries — structured JSON in Postgres, WYSIWYG in admin, safe rendering on the storefront. **No live collab in R1**; that is a separate **D7** track (Yjs + Hocuspocus) only if product asks.

**Do not unify with E3:** Layout spec live merge uses **Automerge/Loro** on `{ root, elements }`. Rich text uses a **different CRDT** (Yjs) and a **different editor surface**. Ship R1 solo-edit first.

---

## Current state (gap analysis)

| Layer | Status | Evidence |
|-------|--------|----------|
| **Wire type** | ✅ | `FieldType` includes `"richText"` — `packages/documents/src/schema.ts` |
| **Server validation** | ✅ | `packages/server/src/domains/documents/validation/richtext.ts` — Zod tree, node/mark allowlists via `constraints` |
| **Server storage** | ✅ | Values live in `documents.data` / locale overrides like any other field — no separate table |
| **`document_ops` patches** | ✅ | Content saves append `patch_data` ops (E3-pre) — works once client sends JSON objects |
| **Shared TS types for clients** | ❌ | `RichTextDocument` only in server validation; not exported from `@noname/documents` |
| **Admin UI** | ❌ | `ContentEntryFieldInput` has no `richText` branch — falls through to plain `<Input>` |
| **`isEditableField()`** | ❌ | `richText` omitted — admin hides field from edit flow |
| **`splitSavePayload()`** | ❌ | No JSON parse path for `richText` — would save a string, fail validation |
| **`fieldsFromResolved()`** | ⚠️ | `JSON.stringify` for objects works for display in a raw editor, not WYSIWYG |
| **Visual editor (layout props)** | ⚠️ | `EditFieldType` has no `rich-text`; introspect maps `description` → `longText` |
| **Storefront render** | ❌ | No `RichTextRenderer` — json-render cannot display CMS rich text fields |
| **Bot / SEO HTML** | ⚠️ | I1 bot SSR extracts plain strings from layout spec only |
| **Seed / demo content** | ❌ | No content types use `richText` in `scripts/seed/` |
| **Live collab** | ❌ deferred | Yjs + TipTap + Hocuspocus — **D7**, not R1 |

### What editors see today

- **Visual editor:** Hero subtitle, product description, etc. are **single-line or textarea** (`text` / `longText`) on component props — paste works as plain text only.
- **Admin → Content:** Same — no formatted body, lists, links, or embedded assets in a rich field.

---

## Target architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Admin / editor UI (R1)                                         │
│  RichTextFieldInput → RichTextDocument JSON                     │
└────────────────────────────┬────────────────────────────────────┘
                             │ PUT content entry (+ client op headers)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  API server                                                     │
│  validateFieldValue(richText) → documents.data                  │
│  document_ops.payload = patch_data (RFC 6902 on data subtree)   │
└────────────────────────────┬────────────────────────────────────┘
                             │ resolve?locale=
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Storefront / json-render (R1)                                  │
│  RichTextRenderer walks node tree → React / semantic HTML       │
└─────────────────────────────────────────────────────────────────┘

Future D7 (only if simultaneous multi-user on same field):
  TipTap ↔ Yjs doc ↔ Hocuspocus WS  (parallel to E3 Automerge layout path)
```

**Storage:** Keep rich text as **structured JSON** inside the content entry document row — same as [`documents-domain.md`](../2026-07-10/documents-domain.md). Do **not** store HTML or Markdown as source of truth.

---

## R1 implementation checklist

Work in this order. Each step should be independently testable.

### Phase R1-a — Shared types + helpers

| # | Task | Files / notes |
|---|------|----------------|
| 1 | Export `RichTextDocument`, node/mark constants from `@noname/documents` (move or re-export from server schema) | `packages/documents/src/richtext.ts` |
| 2 | Add `emptyRichTextDocument()` and `plainTextToRichTextDocument(text: string)` for migration / paste fallback | same |
| 3 | Add `richTextToPlainText(doc)` for labels, search, bot SSR excerpts | same |
| 4 | Unit tests for round-trip and allowlist walking | `richtext.test.ts` |

### Phase R1-b — Admin CMS UI

| # | Task | Files / notes |
|---|------|----------------|
| 5 | Add `richText` to `isEditableField()` | `packages/client/src/documents/content-entries.ts` |
| 6 | Parse/stringify in `splitSavePayload()` — `field.type === "richText"` → `JSON.parse` / validate client-side before save | same |
| 7 | `fieldsFromResolved()` — keep JSON string for form state **or** pass object to dedicated component | same |
| 8 | **`RichTextFieldInput`** component | `packages/client/src/admin/components/content/RichTextFieldInput.tsx` |
| 9 | Wire in `ContentEntryFieldInput` when `field.type === "richText"` | `content-entry-field-input.tsx` |
| 10 | Respect `constraints.allowedNodeTypes` / `allowedMarks` — disable toolbar buttons | read from `ContentFieldSchema.constraints` |
| 11 | Embedded entry/asset blocks — reuse `ReferenceFieldInput` / `MediaFieldInput` inside editor | node types `embedded-*` |

**Editor library (recommendation):** [TipTap](https://tiptap.dev) with a **custom document schema** that serializes to our `RichTextDocument` JSON (not HTML storage). Alternative: Lexical with custom export. Pick one; do not build a bespoke contenteditable.

**Paste (R1):** Accept plain text and basic HTML paste → sanitize → convert to node tree. Defer Word-perfect paste to R1.1.

### Phase R1-c — Server + ops (mostly done)

| # | Task | Files / notes |
|---|------|----------------|
| 12 | Confirm validator rejects malformed trees on create/update | already in `validator.ts` |
| 13 | Ensure `resolve` returns rich text objects (not stringified) | check `refs/resolve` path |
| 14 | Optional: `GET .../ops` timeline shows `patch_data` on rich text paths | E3-pre shipped |

### Phase R1-d — Storefront + json-render

| # | Task | Files / notes |
|---|------|----------------|
| 15 | **`RichTextRenderer`** — map `nodeType` → React elements | `packages/client/src/components/rich-text/` |
| 16 | Resolve `embedded-asset-*` / `embedded-entry-*` via existing ref resolution | align with [`DOCUMENT-REFS.md`](../2026-07-25/DOCUMENT-REFS.md) |
| 17 | Register json-render component or helper for bound CMS fields | catalog / runtime |
| 18 | Email template path — plain-text fallback via `richTextToPlainText` | notifications if needed |

### Phase R1-e — Visual editor props (optional in R1)

Layout props today use plain text. Two options:

| Option | When | Work |
|--------|------|------|
| **A — Defer** | Product OK with longText on layout props | None; CMS `richText` only |
| **B — Add `rich-text` edit field** | Need formatted copy on Hero / product blocks | Add to `EditFieldType`, `EditorFieldControl`, catalog `edit.fields` |

If **B:** add `rich-text` to `packages/client/src/editor/lib/types.ts`, `EditorFieldControl.tsx`, and catalog schemas; store `RichTextDocument` in `elements.*.props.labels` or bind to content entry field (preferred: **reference content entry** with richText field, not inline tree in spec).

**Recommendation:** **A for R1** — keep layout spec scalar; use CMS content entries with `richText` fields referenced from layout via `contentRef` / reference fields.

### Phase R1-f — Demo + tests

| # | Task | Files / notes |
|---|------|----------------|
| 19 | Add `description: richText` to a seed content type (e.g. product) | `scripts/seed/demo-commerce.ts` |
| 20 | Seed one valid `RichTextDocument` example entry | demo seed |
| 21 | Vitest: validator + client splitSavePayload + renderer snapshot | server + client |
| 22 | Manual smoke: admin edit → save → storefront view → resolve API | runbook below |

---

## Manual smoke (R1 done criteria)

```bash
pnpm dev
# 1. Admin → Content → product (or seeded type with richText)
# 2. Edit description: bold, list, link — Save
# 3. GET /api/documents/product/:id/resolve?locale=en-US → data.description is object tree
# 4. Storefront page bound to entry shows formatted HTML (not raw JSON)
# 5. Invalid tree (paste garbage JSON in devtools) → 400 validation error
```

---

## D7 — Live rich-text collab (explicitly out of R1)

| | Layout spec (E3) | Rich text (D7) |
|--|------------------|----------------|
| **Data** | json-render `{ root, elements }` | `RichTextDocument` per field |
| **CRDT** | Automerge (primary) / Loro | **Yjs** |
| **Transport** | automerge-repo WS adapter | **Hocuspocus** |
| **Editor** | Custom spec canvas + props | **TipTap** + `@tiptap/extension-collaboration` |
| **When** | Phase C product gate | Only if Google-Docs-style simultaneous edit on long text |

See [`E3-LIVE-CRDT-COLLAB-IMPLEMENTATION.md`](./E3-LIVE-CRDT-COLLAB-IMPLEMENTATION.md) § Yjs + Hocuspocus.

**R1 must not block D7:** Solo save + `document_ops` audit is enough until collab is requested. TipTap doc can add Yjs extension later without changing storage format.

---

## Do not build (R1)

| Skip | Why |
|------|-----|
| Automerge for rich text | Wrong CRDT; use Yjs when collab needed |
| HTML as source of truth | XSS + channel loss; JSON tree is canonical |
| Raw JSON textarea for editors | Fails UX goal; use WYSIWYG |
| Whole-spec Yjs for layout | E3 spike rejected — use Automerge for spec tree |

---

## Doc cross-links

| Doc | Role |
|-----|------|
| [`documents-domain.md`](../2026-07-10/documents-domain.md) | Canonical node/mark model |
| [`DOCUMENT-REFS.md`](../2026-07-25/DOCUMENT-REFS.md) | Embedded entry/asset nodes |
| [`VISUAL-EDITOR-COLLAB-CRDT.md`](../2026-08-01/VISUAL-EDITOR-COLLAB-CRDT.md) | Product gates for collab |
| [`E3-SPIKE-REPORT.md`](./E3-SPIKE-REPORT.md) | Layout CRDT choice — separate track |

---

*Last updated: 2026-08-06 — R1 plan from gap analysis; server validation exists, all client paths missing.*
