# Visual Editor — Build Plan

> **Date:** 2026-08-01  
> **Status:** Phase A ✅ · Phase B ✅ (smoke pending) · Phase C ✅ (C9 smoke pending) · Phase D ✅  
> **Decisions:** [`VISUAL-EDITOR-GAP-ANALYSIS.md`](./VISUAL-EDITOR-GAP-ANALYSIS.md) (D7 + D8 deferred; all else locked)

---

## Goal

Ship a **strict, hybrid, spec-driven** storefront editor:

- Palette + **layer tree** + live canvas + props panel  
- Placement from catalog **`slots`** (D2b)  
- Clear **Layout vs Content** + template scope (D3c)  
- **No** custom code or action wiring in editor (D8 later)

**First E2E target:** `yogastore.localhost:5173/products/demo-sneakers?edit=true` (`product_detail` template).

---

## Phase overview

| Phase | Target window | Outcome |
|-------|---------------|---------|
| **A — Clarity** | Week of 2026-08-04 | Merchants understand what they edit and where it saves |
| **B — Structure** | Week of 2026-08-11 | Layer tree, reorder/reparent, catalog slot drop targets |
| **C — Polish** | Week of 2026-08-18 | Selection chip, duplicate, rich field types |
| **D — Spec shell** | Week of 2026-08-25 | `VisualEditorShell` wired from layout; less `main.tsx` special case |
| **Smoke** | End of Aug 2026 | Full pass on `product_detail`, then `home` |

Dates are **targets** — adjust when a phase completes.

---

## Phase A — Clarity

**Decisions:** D3c, D9, D11 (start)

### Tasks

- [x] **A1** Scope banner in save bar or below it  
  - Layout template name (e.g. `product_detail`)  
  - Plain text: “Changes to layout affect all pages using this template”  
  - When `pageContentRef` set: show content ref + “Page content — this URL only”

- [x] **A2** Field badges in PropsPanel  
  - **Layout** — props saved to layout draft  
  - **Content** — fields bound to `$state` / CMS  
  - Hide or soften raw `elements.{id}` for merchants (dev tooltip ok)

- [x] **A3** Save copy pass  
  - Keep top **Save draft** + panel **Save to page** for pending blocks (D9)  
  - One-line help: when to use each

- [x] **A4** Storefront **Edit page** entry  
  - Visible when session can draft (`editor` / `admin`)  
  - Links to current URL + `?edit=true`

- [x] **A5** Manual smoke on `product_detail` — core PASS 2026-08-05 ([`EDITOR-SMOKE-PRODUCT-DETAIL.md`](./EDITOR-SMOKE-PRODUCT-DETAIL.md))  
  - Checklist: [`EDITOR-SMOKE-PRODUCT-DETAIL.md`](./EDITOR-SMOKE-PRODUCT-DETAIL.md)

### Done when

Merchant can tell layout vs content vs template scope without reading code.

---

## Phase B — Structure

**Decisions:** D2b, D4, D5

### Tasks

- [x] **B1** Catalog-driven drop targets  
  - Read `slots` from loaded catalog schemas  
  - Replace `EDITOR_CONTAINER_TYPES` hardcoded set  
  - Keep `PALETTE_EXCLUDED_TYPES` for non-storefront components  
  - Migrate `preferredParentType` toward schema defaults where possible

- [x] **B2** Layer tree panel (hybrid)  
  - Spec tree from `storedSpec` / preview  
  - Click row → same selection as canvas  
  - Show component type + element id (compact)  
  - Nest indent for Stack → Grid → children

- [x] **B3** Reorder siblings  
  - Drag in layer tree (⠿ handle); up/down removed — drag-only  
  - Update `children[]` order in layout spec

- [x] **B4** Reparent blocks  
  - Drag in tree to valid slot container (before / after / inside)  
  - “Move to…” dropdown removed (drag replaces it)

- [x] **B5** Canvas ↔ tree sync  
  - Selection, delete, pending add reflected in both

- [x] **B6** Smoke: add Hero to Stack, reorder in Grid, reparent Text — core PASS 2026-08-01/05; manual drag rows open  
  - Checklist: [`EDITOR-SMOKE-PRODUCT-DETAIL.md`](./EDITOR-SMOKE-PRODUCT-DETAIL.md)

### Done when

Structure edits do not require delete + re-add.

---

## Phase C — Polish

**Decisions:** D10; **not** D7 (deferred)

### Tasks

- [x] **C1** Floating selection chip on canvas (type + optional label)

- [x] **C2** Click cycle: inner block → parent (Shift+click or repeated click)

- [x] **C3** Duplicate block (copy spec subtree with new ids)

- [x] **C4** Rich props — **media** field → asset picker (reuse admin assets API)

- [x] **C5** Rich props — **enum** → select

- [x] **C6** Rich props — **boolean** → toggle

- [x] **C7** Rich props — **reference** → content entry picker (via content schema + `ContentEntryFieldInput`)

- [x] **C8** Action-related props — **read-only or hidden** until D8 (`ctaAction`, `config.action`, etc.)

- [x] **C9** Smoke: Hero image, ProductCard fields, duplicate Text block — partial (enum/action PASS); image/duplicate manual open

### Done when

Common field types work without raw text IDs; no inline canvas text (D7).

---

## Phase D — Spec-driven shell

**Decisions:** D6

### Tasks

- [x] **D1** Layout seed / template for edit mode chrome  
  - `VisualEditorShell` with labels + slot children in `visual_editor` layout (`pnpm seed:demo`)

- [x] **D2** Wire host: `EditorHost` export; `main.tsx` uses editor module entry

- [x] **D3** Document in `skills/spec-driven-ui` — [`reference.md` § Visual editor](../../skills/spec-driven-ui/reference.md#visual-editor)

- [x] **D4** Edit mode strings from layout seed (`useEditorShell` + `editorShellLabelsSchema`)

- [x] **D5** Render shell from layout spec  
  - `EditPageView` → `EditorSessionProvider` → `Renderer(visual_editor)`  
  - Slot components (`EditorPalette`, `EditorLayerTree`, `EditorCanvas`, `EditorPropsPanel`) read session context

### Done when

Editor chrome is spec-driven like other platform surfaces.

---

## Post-v1 backlog

| Item | Verdict | Notes |
|------|---------|-------|
| Inline text edit | **Skip (D7)** | PropsPanel sufficient |
| Action binding UI | **Done (D8)** | Storefront action select |
| Editor prefs | **Done** | Cross-device pins, layout, tree collapse |
| Undo / redo | **Done** | Session-local; skip server/CRDT |
| 409 / If-Match | **Done** | Layout draft |
| Responsive preview | **Done** | canvasPreview toggle |
| Collab / CRDT / presence | **Skip** | [`VISUAL-EDITOR-COLLAB-CRDT.md`](./VISUAL-EDITOR-COLLAB-CRDT.md) |
| Field ACL in PropsPanel | **Skip** | Document / content-type as unit — [FIELD-ACL.md](./FIELD-ACL.md) |
| D2c per-template allowlists | **Skip** | If palette too noisy |
| `accepts: string[]` on schemas | **Skip/TBD** | If `slots` too permissive |

---

## Test plan (each phase)

```bash
pnpm dev                                    # server :3000
pnpm --filter @noname/workers dev           # edge :8787
pnpm --filter @noname/client dev            # client :5173
pnpm seed:demo                              # editor_prefs content type
```

1. Login `admin@zitadel.localhost` on `yogastore.localhost:5173`  
2. Open `/products/demo-sneakers?edit=true`  
3. Phase-specific checklist from sections above  
4. Exit edit → visitor view matches published (after publish if needed)

---

## Approval

Reply **“approve build plan”** (or note phase order changes) to start **Phase A** implementation.

```
[ ] Build plan approved — start Phase A
[ ] Adjust phases: ___
```

---

## Doc map

| Doc | Role |
|-----|------|
| [`VISUAL-EDITOR-GAP-ANALYSIS.md`](./VISUAL-EDITOR-GAP-ANALYSIS.md) | Why / decisions |
| **This file** | What to build, when |
| [`VISUAL-EDITOR-COLLAB-CRDT.md`](./VISUAL-EDITOR-COLLAB-CRDT.md) | Collab / CRDT — skip until multi-editor |
| [`COLLAB-EDITOR-SETUP.md`](./COLLAB-EDITOR-SETUP.md) | Collab setup examples |
| [`VISUAL-EDITOR-UX.md`](../2026-07-25/VISUAL-EDITOR-UX.md) | Interaction target |
| [`reference.md` § Content types](../../skills/spec-driven-ui/reference.md#content-types) | Content type naming |
