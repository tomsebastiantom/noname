# Collaborative Editor — Setup & Examples

> **Date:** 2026-08-01  
> **Status:** **Deferred** — solo edit ships first; live multi-user collab is Phase 3  
> **Related:** [`VISUAL-EDITOR-GAP-ANALYSIS.md`](./VISUAL-EDITOR-GAP-ANALYSIS.md) · [`VISUAL-EDITOR-IMPLEMENTATION-ORDER.md`](../2026-07-25/VISUAL-EDITOR-IMPLEMENTATION-ORDER.md) · [`PERMISSIONS-OSS-REFERENCES.md`](../2026-07-25/PERMISSIONS-OSS-REFERENCES.md)

---

## One-line summary

**Today:** one merchant, one browser session — client undo + `If-Match` on save.  
**Later (when teams grow):** append **`document_ops`**, then **Automerge** for live layout spec sync; **Yjs/Hocuspocus** only if rich-text fields need Google-Docs-style editing.

You do **not** need CRDT or a WebSocket collab server until multiple people routinely edit the **same draft at the same time**.

---

## When collab becomes necessary

| Situation | Enough today? | What to add |
|-----------|---------------|-------------|
| One merchant edits a page alone | ✅ | Nothing |
| Same merchant, two tabs, saves at different times | ✅ | **409 + Refresh** (`If-Match: updatedAt`) — shipped |
| Same merchant, undo mistakes before save | ✅ | Client **⌘Z / ⌘⇧Z** — shipped (session-local) |
| Two merchants edit **same layout draft concurrently** | ❌ | **409** catches save-time conflict; no live merge yet |
| “Alice is editing this page” presence | ❌ | `document_ops` + presence channel (Phase 2) |
| Live cursors / no-save merge while typing | ❌ | **Automerge** (spec tree) or **Yjs** (rich text) — Phase 3 |
| Undo after refresh or on another device | ❌ | Server **op log** replay — Phase 2, not CRDT |

As tenant teams simplify and more people work on the same storefront, **409 conflicts will show up more often**. That is the signal to invest in op log + collab — not before solo edit + publish is stable.

---

## What ships today (v1 setup)

### Example 1 — Solo edit (default)

```
Merchant opens  /products/demo-sneakers?edit=true
  → loads layout draft + page content
  → edits blocks in canvas / props panel
  → ⌘Z undoes unsaved changes (this tab only)
  → Save draft  → PUT /api/documents/layout/:id  +  If-Match: "<updatedAt>"
  → Publish     → admin permission + publish endpoint
```

**Client modules:** `EditPageView`, `useLayoutDraft`, `useEditorHistory`, `useContentDraft`  
**Server:** layout PUT with optional `If-Match` → **409 Conflict** if another save landed first.

### Example 2 — Two tabs, sequential save (conflict path)

```
Tab A: loads layout  updatedAt = T1
Tab B: loads layout  updatedAt = T1
Tab A: saves         → server updatedAt = T2
Tab B: saves         → If-Match: T1  → 409
  → Save bar: "Someone else saved — Refresh"
  → Refresh reloads T2; merchant re-applies or discards local edits
```

This is **intentional v1 behaviour** — last writer does not silently win.

### Example 3 — Undo scope (do not expect cross-device)

```
Same tab:  edit title → ⌘Z  → reverts title     ✅
Refresh:   ⌘Z                  → nothing          ❌ (by design)
Phone + laptop: shared undo    → nothing          ❌ (needs op log)
After Save draft: ⌘Z          → nothing          ❌ (history cleared)
```

Use **Discard** to revert all unsaved work to the last loaded draft.

---

## Future setup (when collab is required)

Follow this order — do not skip to CRDT.

### Phase 2 — Op log + audit (before live collab)

**Trigger:** need “who changed what”, cross-session undo, or ordering ops before merge.

```
POST/PUT save  →  append row to document_ops
                 (layout_id, user_id, client_seq, server_version, patch | payload)
GET  /layout/:id/ops?since=…  →  replay for refresh / audit UI
```

**Postgres table (sketch):**

| Column | Purpose |
|--------|---------|
| `document_id` | Layout or content entry |
| `server_version` | Monotonic per document |
| `client_seq` | Client ordering hint |
| `actor_id` | ZITADEL user |
| `payload` | RFC 6902 patch or op envelope |
| `created_at` | Audit |

**Undo across refresh:** client replays inverse ops from log — still not CRDT.

See [`PERMISSIONS-REBAC.md`](../2026-07-25/PERMISSIONS-REBAC.md) § `document_ops` and [`SPEC-STORAGE-MERGE.md`](../2026-07-25/SPEC-STORAGE-MERGE.md) § patches.

### Phase 3a — Live layout spec collab (Automerge)

**Trigger:** two+ editors on the **same json-render spec** simultaneously.

```
                    ┌─────────────────┐
  Editor A ──WS──►  │  sync service   │  ◄──WS── Editor B
  (Automerge doc)   │  (or peer relay)│       (Automerge doc)
                    └────────┬────────┘
                             │ periodic snapshot
                             ▼
                    PUT layout draft (If-Match still at publish boundary)
```

**Spike first (offline merge, no WebSocket):**

```
Client A: elements.hero.props.labels.title = "Sale"
Client B: elements.grid.props.config.columns = 2
  → Automerge.merge(docA, docB)
  → both paths present, no central OT server
```

Repo: [automerge/automerge](https://github.com/automerge/automerge)  
**Do not** use Yjs for whole layout spec — poor fit for arbitrary JSON graphs ([`PERMISSIONS-OSS-REFERENCES.md`](../2026-07-25/PERMISSIONS-OSS-REFERENCES.md)).

### Phase 3b — Rich-text field collab (Yjs + Hocuspocus)

**Trigger:** two merchants edit the **same CMS longText / ProseMirror field** at once.

```
PropsPanel longText field
  → TipTap + @tiptap/extension-collaboration
  → Yjs doc per field (or per content entry)
  → Hocuspocus WebSocket server
```

**Do not** use Hocuspocus for Hero layout / grid / block tree — use Automerge (3a).

---

## Decision checklist (before building collab)

Answer **yes** to at least one before starting Phase 2:

- [ ] Multiple editors on the same tenant hit **409** weekly and Refresh is unacceptable UX  
- [ ] Product requires **presence** (“Bob is editing”) on save bar  
- [ ] Compliance / audit needs **append-only edit history** per layout  
- [ ] Merchants expect **Google Docs–style** simultaneous editing on page content  

If all **no** → stay on v1 (solo + 409 + client undo).

---

## What not to do early

| Skip | Reason |
|------|--------|
| CRDT in production before Automerge spike | Prove merge on real `product_detail` spec first |
| Server-side undo/redo without `document_ops` | No durable ordering or audit |
| Yjs for full layout spec | Use Automerge for JSON tree |
| Automerge for rich text | Use Yjs + TipTap |
| Collab before ZITADEL **editor** role guards stable | [`VISUAL-EDITOR-IMPLEMENTATION-ORDER.md`](../2026-07-25/VISUAL-EDITOR-IMPLEMENTATION-ORDER.md) steps 0–2 |

---

## Implementation order (quick reference)

```
Today   Solo edit + If-Match 409 + client undo
  ↓
Step 6  document_ops op log + server_version
  ↓
Step 7  Automerge offline spike (layout spec)
  ↓
Step 9  Hocuspocus + Yjs (rich text only, if required)
  ↓
Step 10 Automerge + WebSocket sync (live spec collab)
```

Full table: [`VISUAL-EDITOR-IMPLEMENTATION-ORDER.md`](../2026-07-25/VISUAL-EDITOR-IMPLEMENTATION-ORDER.md).

---

## Code touchpoints (today vs later)

| Concern | Today | Later |
|---------|-------|-------|
| Draft load | `useLayoutDraft` → `getLayoutForTemplate` | + op cursor / Automerge handle |
| Save | `saveLayout` + `If-Match: updatedAt` | + append `document_ops` |
| Conflict UI | `SaveBar` + `ApiConflictError` | + optional merge UI |
| Undo | `useEditorHistory` (in-memory) | Replay from `document_ops` or CRDT doc |
| Presence | — | WS + `document_ops` subscribers |
| Permissions | JWT `editor` / `admin` | + `relation_tuples` per document |

---

## Doc map

| Question | Read |
|----------|------|
| **This file — collab when & how** | **this file** |
| Current editor gaps & shipped items | [`VISUAL-EDITOR-GAP-ANALYSIS.md`](./VISUAL-EDITOR-GAP-ANALYSIS.md) |
| Build phases & smoke | [`VISUAL-EDITOR-BUILD-PLAN.md`](./VISUAL-EDITOR-BUILD-PLAN.md) |
| OSS tools (Automerge vs Yjs) | [`PERMISSIONS-OSS-REFERENCES.md`](../2026-07-25/PERMISSIONS-OSS-REFERENCES.md) |
| Tuple + op log model | [`PERMISSIONS-REBAC.md`](../2026-07-25/PERMISSIONS-REBAC.md) |
| Patch storage | [`SPEC-STORAGE-MERGE.md`](../2026-07-25/SPEC-STORAGE-MERGE.md) |

---

*Last updated: 2026-08-01 — documents deferred collab path; v1 solo edit + 409 + session undo is sufficient until multi-editor pressure appears.*
