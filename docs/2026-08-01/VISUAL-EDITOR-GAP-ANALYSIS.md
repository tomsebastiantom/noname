# Visual Editor — Gap Analysis

> **Date:** 2026-08-01 (updated)  
> **Status:** Phases A + B + C + D ✅ · **Smoke:** partial pass 2026-08-01 ([`EDITOR-SMOKE-PRODUCT-DETAIL.md`](./EDITOR-SMOKE-PRODUCT-DETAIL.md))  
> **Build:** [`VISUAL-EDITOR-BUILD-PLAN.md`](./VISUAL-EDITOR-BUILD-PLAN.md)  
> **Related:** [`VISUAL-EDITOR-UX.md`](../2026-07-25/VISUAL-EDITOR-UX.md) · [`VISUAL-EDITOR-PLAN.md`](../2026-07-25/VISUAL-EDITOR-PLAN.md) · [`reference.md` § Visual editor](../../skills/spec-driven-ui/reference.md#visual-editor)

---

## One-line summary

We have a **hybrid builder editor** with palette + layer tree + live canvas + props panel, catalog slots, cross-device prefs, rich CMS fields, spec-driven chrome, json-render shell, session undo/redo, 409 save conflicts, responsive preview, and D8 action picker. **Editor v1 code-complete** — optional manual smoke items in [`EDITOR-SMOKE-PRODUCT-DETAIL.md`](./EDITOR-SMOKE-PRODUCT-DETAIL.md).

---

## Skip vs build (2026-08-01)

| Item | Verdict | Notes |
|------|---------|-------|
| **Build now** | **Smoke** — partial pass; optional drag/409/publish checks |
| **D7 inline text** | **Skip** | PropsPanel covers same data; canvas contenteditable is high complexity |
| **D8 action picker** | **Done** | Select for `ctaAction` / `action`; auth actions excluded |
| **Undo / redo** | **Done (v1 scope)** | Session-local ⌘Z — **skip** server/CRDT undo unless cross-device required |
| **409 / If-Match** | **Done** | `If-Match: updatedAt` on layout PUT |
| **Responsive preview** | **Done** | Desktop / tablet / mobile toggle |
| **Collab / CRDT / presence** | **Skip** | See [`VISUAL-EDITOR-COLLAB-CRDT.md`](./VISUAL-EDITOR-COLLAB-CRDT.md) — only when simultaneous multi-editor is real |
| **`document_ops` op log** | **Skip** | v2 audit path; before live collab |
| **Field ACL — what to track & wiring** | [`FIELD-ACL.md`](./FIELD-ACL.md) |
| Collab / CRDT — when to build | [`VISUAL-EDITOR-COLLAB-CRDT.md`](./VISUAL-EDITOR-COLLAB-CRDT.md) |
| **D2c per-template block allowlists** | **Skip** | Only if palette noise becomes a problem |
| **Reorder shell slots from admin UI** | **Skip** | Spec tree supports it; no merchant need yet |
| **Content PUT If-Match** | **Skip** | Layout only today; add when content conflicts matter |
| **Cross-device undo** | **Skip** | Needs `document_ops` — not CRDT |

---

## Platform scope (locked — unchanged)

The visual editor is **not** a general page builder. It is a **strict composer** over the **storefront catalog** (spec-driven UI).

| In scope | Out of scope (for now) |
|----------|-------------------------|
| Compose **allowed** catalog blocks on a layout template | Merchants adding **custom React code** in the editor |
| Edit **schema-defined** props (`config` + `labels`) | Merchants wiring **actions / logic** in the editor (e.g. button → `addToCart`) |
| Add / remove / reorder blocks within **catalog placement rules** | New component types without a dev shipping React + `catalog-schemas.ts` |
| Save **layout draft** + **page content** where linked | Raw JSON layout editor (stays `/admin/layout` escape hatch) |
| Palette from **tenant catalog manifest** minus exclusions | Admin auth components, login chrome, arbitrary HTML/CSS |

**Policy (one line):** Great storefront pages come from **pre-built blocks + layout + content**; the editor configures within that contract; missing blocks or behavior ship as **catalog + actions** in code, later optionally exposed in the editor.

---

## Approved decisions (2026-08-01 — unchanged)

| ID | Choice | Status |
|----|--------|--------|
| **D1** | **C — Hybrid** | ✅ Shipped — palette + canvas + layer tree |
| **D2** | **D2b — Catalog slots** | ✅ Shipped — `componentAcceptsChildren()` reads schema `slots` |
| **D3** | **D3c — Clarity full** | ✅ Shipped — scope banner + Layout/Content badges |
| **D4** | Layer tree | ✅ Shipped |
| **D5** | Reorder + reparent | ✅ Shipped (tree drag; no up/down arrows by design) |
| **D6** | `VisualEditorShell` from layout spec | ✅ Seed + `Renderer` + session-backed slot components |
| **D7** | Inline text edit | ⏸ **Skip** |
| **D8** | Action binding picker | ✅ Shipped — storefront action select in PropsPanel |
| **D9** | Keep both saves + clearer copy | ✅ Shipped — all copy from `VisualEditorShell.props.labels` |
| **D10** | Rich field editors | ✅ Shipped — media, enum, boolean, reference via `ContentEntryFieldInput` |
| **D11** | `product_detail` first E2E | ⚠️ Infra ready; **manual smoke not done** |

---

## What exists today (updated inventory)

| Area | Status | Notes |
|------|--------|-------|
| `?edit=true` entry | ✅ | Auth redirect, MFA gate, session checks |
| Live page canvas (real `Renderer`) | ✅ | Same components visitors see |
| Click → select block | ✅ | `[data-jr-key]` + outline |
| Hover outline | ✅ | CSS on canvas |
| Left **palette** (catalog-driven) | ✅ | Search, pins, drag/click add — **labels from shell spec** |
| Drag-drop add + insertion line | ✅ | Catalog slot containers; drop hint templates from labels |
| Right **props panel** | ✅ | Layout fields + CMS `$state` fields (C7) |
| Layout + content save | ✅ | Save bar; content first on save |
| Staged add (amber dashed) | ✅ | `propsSaveToPageLabel` from shell labels |
| Delete block | ✅ | Delete / Backspace |
| **Duplicate block** | ✅ | ⌘D + props panel action |
| Resizable / collapsible panels | ✅ | Blocks, Layers, Properties — independent; stacked mode has per-section hide |
| **Editor prefs (cross-device)** | ✅ | `editor_prefs`: pins, layout, layer-tree collapse per template |
| Schema-driven field list | ✅ | From Zod via `schema-introspect` |
| Publish (admin only) | ✅ | `canPublish` from session |
| Scope banner (template + content ref) | ✅ | `EditorScopeBanner` — shell labels |
| Layout / Content field badges | ✅ | `PropsPanel` |
| Storefront **Edit page** link | ✅ | `AuthBar` when session can draft |
| **Layer tree panel** | ✅ | Drag reorder/reparent; expand/collapse — shell labels |
| Catalog **`slots`** for drop targets | ✅ | `catalog-slots.ts` |
| Canvas ↔ tree selection sync | ✅ | Shared selection; canvas scrolls to selected row |
| Floating **selection chip** on canvas | ✅ | Component label on selected block |
| Click cycle inner → parent | ✅ | Shift+click or double-click within 500ms |
| **Spec-driven chrome copy** | ✅ | Save bar, scope, props, palette, layers, canvas, panel rails — `useEditorShellLabels()` |
| **`VisualEditorShell` layout seed** | ✅ | `visual_editor` template in seed |
| **`EditorHost` + spec shell** | ✅ | `EditPageView` → `Renderer(visual_editor)` → `VisualEditorShell` + slot children |
| **Inline text edit** (D7) | ⏸ Skip | Double-click `Text` on canvas; v1 = PropsPanel only |
| **Action binding picker** (D8) | ✅ | Dropdown for `ctaAction` / `action` from catalog (`addToCart`, `checkout`, `navigate`, …) |
| Undo / redo | ✅ | Session ⌘Z / ⌘⇧Z before save; cleared on save/discard — not cross-device |
| Version conflict (409 / If-Match) | ✅ | Layout PUT + refresh banner |
| Field-level CMS ACL in panel | ⚠️ Defer | See [`FIELD-ACL.md`](./FIELD-ACL.md) — UI simple; needs role on API + schema |
| Responsive preview | ✅ | Desktop / tablet (768px) / mobile (390px) toolbar |
| Live collab / CRDT | ⏸ Skip | [`VISUAL-EDITOR-COLLAB-CRDT.md`](./VISUAL-EDITOR-COLLAB-CRDT.md) |

---

## Four stores (still the mental model)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  EDGE (visitor view)                                                     │
│  displaySpec = published layout + CMS content merged into $state         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ?edit=true loads editor on top
                                    ▼
┌──────────────────┬──────────────────────┬───────────────────────────────┐
│  LAYOUT DRAFT    │  CONTENT DRAFT       │  EPHEMERAL (browser only)      │
│  storedSpec      │  pageContentRef      │  pendingAdd, selection         │
│  PUT layout API  │  PUT content API     │  until Save draft              │
└──────────────────┴──────────────────────┴───────────────────────────────┘
                                    │
                    editor UI prefs (fourth store — not page data)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  EDITOR PREFS (per user, cross-device)                                   │
│  palettePins, panel layout, layer-tree collapse — `editor_prefs` content │
└─────────────────────────────────────────────────────────────────────────┘
```

| You change… | Goes to… | Affects… |
|-------------|----------|----------|
| Hero title (layout props) | **Layout** draft | Every page using this **layout template** |
| Product title on ProductCard (`$state`) | **Content** entry | This **page’s** CMS row only |
| New block from palette (before save) | **Pending** preview only | Nothing on server until Save draft |
| Pinned blocks / panel widths / tree collapse | **`editor_prefs`** | Your editor UI on all devices — not the storefront |

---

## Phase progress

### Phase A — Clarity ✅ (minus smoke)

| Task | Status |
|------|--------|
| A1 Scope banner | ✅ |
| A2 Layout / Content badges | ✅ |
| A3 Save copy | ✅ |
| A4 Edit page entry | ✅ |
| A5 Manual smoke `product_detail` | ✅ Partial — see smoke doc |

### Phase B — Structure ✅ (minus smoke)

| Task | Status |
|------|--------|
| B1 Catalog slot drop targets | ✅ |
| B2 Layer tree panel | ✅ |
| B3 Reorder siblings | ✅ Tree drag only |
| B4 Reparent | ✅ Tree drag (before/after/inside) |
| B5 Canvas ↔ tree sync | ✅ |
| B6 Structure smoke | ✅ Partial — hide blocks, selection sync |

### Phase C — Polish ✅ (minus smoke)

| Task | Status |
|------|--------|
| C1 Selection chip | ✅ |
| C2 Click parent cycle | ✅ |
| C3 Duplicate block | ✅ |
| C4–C6 Rich fields (media, enum, boolean) | ✅ |
| C7 Reference fields via content schema | ✅ |
| C8 Action props in panel | ✅ | Picker shows actions; `config.params` still hidden |
| C9 Polish smoke | ✅ Partial — enum, D8 action, preview toolbar |

### Phase D — Spec-driven shell ✅ (minus optional slot reorder in admin)

| Task | Status |
|------|--------|
| D1 `VisualEditorShell` layout seed | ✅ Includes palette/layers/canvas/panel slot children |
| D2 Wire host (`EditorHost`) | ✅ |
| D3 Docs in spec-driven-ui | ✅ [`reference.md` § Visual editor](../../skills/spec-driven-ui/reference.md#visual-editor) |
| D4 Strings from layout seed | ✅ All merchant chrome wired to `props.labels` |
| D5 json-render slot shell | ✅ `EditPageView` renders `visual_editor` spec via `Renderer` + `EditorSessionProvider` |

---

## Remaining gaps (prioritized)

### P0 — Smoke (optional follow-ups)

See [`EDITOR-SMOKE-PRODUCT-DETAIL.md`](./EDITOR-SMOKE-PRODUCT-DETAIL.md) — core paths verified 2026-08-01. Remaining: layer drag, two-tab 409, content-field on ProductCard, publish/exit visitor view.

### P1 — Defer (build only when product asks)

| Item | Why defer |
|------|-----------|
| **D7** inline canvas text | Panel editing sufficient; high UX complexity |
| **Field ACL in PropsPanel** | See [`FIELD-ACL.md`](./FIELD-ACL.md) — defer until schemas use `permissions` |
| **D2c** per-template palette allowlists | No merchant pain yet |
| **Admin shell slot reorder** | Spec-ready; no UI need |

### P2 — Skip until multi-editor pressure

| Item | Doc |
|------|-----|
| `document_ops` audit log | [`VISUAL-EDITOR-IMPLEMENTATION-ORDER.md`](../2026-07-25/VISUAL-EDITOR-IMPLEMENTATION-ORDER.md) step 6 |
| Automerge / live spec collab | [`VISUAL-EDITOR-COLLAB-CRDT.md`](./VISUAL-EDITOR-COLLAB-CRDT.md) |
| Yjs / Hocuspocus rich-text collab | Same — rich text only |
| Cross-device undo | Op log replay — not CRDT |
| Content draft If-Match | Layout conflicts shipped first |

---

## Post-v1 glossary

Short explanations of backlog items — what they are, what exists today, and what “done” looks like.

### Field-level CMS ACL (in props panel)

**What it is:** Per-field read/write rules on a **content type schema**, not whole-page roles.

**Full guide:** [`FIELD-ACL.md`](./FIELD-ACL.md) — what to track, server/client gaps, implementation checklist.

**Today:** Schema supports `permissions`; server helpers exist but editor uses `/resolve` without `role` and PropsPanel shows all fields.

**Done looks like:** Same role key end-to-end (`session.teamRole` → `?role=` → PropsPanel hide/read-only).

---

### D7 — Inline text edit

**What it is:** Double-click a **Text** block on the canvas → edit copy **in place** (contenteditable), not only in the right panel.

**Today (v1):** Click Text → edit **Title / body** in PropsPanel. Same save paths (layout draft or content draft).

**Done looks like:** Double-click visible paragraph → caret in canvas → blur/Enter saves to the same `labels.content` or `$state` field the panel would update. No second render tree — still the live `Renderer`.

**Why deferred:** Panel editing ships the same data model with less complexity (selection, focus, rich text, escape/blur, pending state on canvas).

---

### D8 — Action binding picker ✅

**What it is:** UI to wire **Button / Hero CTA** to catalog actions (e.g. `addToCart`) instead of raw action strings.

**Shipped:** PropsPanel **action** field type — dropdown from storefront catalog (`navigate`, `addToCart`, `checkout`, …). Auth actions excluded. `config.params` still hidden.

---

### Undo / redo ✅ (session scope)

**What it is:** ⌘Z / ⌘⇧Z for layout + content edits before save.

**Shipped:** In-memory stack (`useEditorHistory`) — layout spec, content values, pending block, selection. Debounced for typing bursts. Cleared on save, publish, discard, refresh.

**Skip:** Server-side or cross-device undo — needs `document_ops`, not CRDT. See collab doc.

---

### 409 / version conflicts ✅

**What it is:** Two tabs save same layout; second gets **409** + refresh banner.

**Shipped:** Layout PUT sends `If-Match: "<updatedAt>"`; `ApiConflictError` → Save bar message + **Refresh** button.

**Skip for now:** Content entry PUT If-Match (same pattern, add when needed).

---

### Responsive preview ✅

**What it is:** Mobile / tablet width toggle in editor canvas.

**Shipped:** Toolbar above canvas — Desktop / Tablet (768px) / Mobile (390px); persisted in `editor_prefs.layout.canvasPreview`.

---

### Collab / presence (v3) — skip

**What it is:** “Bob is editing this page”, live cursors, op stream.

**Verdict:** **Do not build** until simultaneous multi-editor is a product requirement. **409 + session undo** is enough until then.

**Read:** [`VISUAL-EDITOR-COLLAB-CRDT.md`](./VISUAL-EDITOR-COLLAB-CRDT.md) · [`COLLAB-EDITOR-SETUP.md`](./COLLAB-EDITOR-SETUP.md) (setup examples).

---


## Spec-driven labels (shipped)

All merchant-visible editor strings live in **`visual_editor` layout** → `VisualEditorShell.props.labels`, validated by `editorShellLabelsSchema`. No TS fallbacks for chrome copy.

| Surface | Label keys (examples) |
|---------|----------------------|
| Save bar + collapsed rail | `saveLabel`, `publishedLabel`, `publishPermissionTitle`, … |
| Scope banner | `scopeLayoutTitle`, `scopeContentBody`, … |
| Props panel | `propsDuplicateLabel`, `propsSaveToPageLabel`, `propsBlockSuffix`, … |
| Palette | `palettePinnedTitle`, `paletteFilterPlaceholder`, `paletteDragToAddHint`, … |
| Layer tree | `layerTreeHint`, `layerTreeEmpty`, `layersPanelTitle`, … |
| Canvas | `canvasAriaLabel`, `dropAtTopTemplate`, … |
| Panel chrome | `blocksPanelTitle`, `closePanelLabel`, `resizePanelAriaLabel`, … |

**Full key list:** `packages/client/src/editor/schemas/components.ts` → `editorShellLabelsSchema`. Seed: `scripts/seed-demo.ts` → `visualEditorShellSpec`. Agent boundaries: [`reference.md` § Visual editor](../../skills/spec-driven-ui/reference.md#visual-editor).

**Bootstrap exception:** If `visual_editor` labels are missing entirely, `EditPageView` shows a fixed dev/setup error (cannot read labels from a layout that failed to load).

---

## Doc map

| Question | Read |
|----------|------|
| Permissions & roles | [`VISUAL-EDITOR-PLAN.md`](../2026-07-25/VISUAL-EDITOR-PLAN.md) |
| Click UX target | [`VISUAL-EDITOR-UX.md`](../2026-07-25/VISUAL-EDITOR-UX.md) |
| **This gap list & current status** | **this file** |
| Dated tasks & checkboxes | [`VISUAL-EDITOR-BUILD-PLAN.md`](./VISUAL-EDITOR-BUILD-PLAN.md) |
| **Field ACL — what to track & wiring** | [`FIELD-ACL.md`](./FIELD-ACL.md) |
| Collab / CRDT — when to build | [`VISUAL-EDITOR-COLLAB-CRDT.md`](./VISUAL-EDITOR-COLLAB-CRDT.md) |
| Collab setup examples | [`COLLAB-EDITOR-SETUP.md`](./COLLAB-EDITOR-SETUP.md) |
| Shell label keys (Zod + seed) | `packages/client/src/editor/schemas/components.ts`, `scripts/seed-demo.ts` |
| Editor agent entry (boundaries) | [`reference.md` § Visual editor](../../skills/spec-driven-ui/reference.md#visual-editor) |
| Content type checklist | [`reference.md` § Content types](../../skills/spec-driven-ui/reference.md#content-types) · [`documents-domain.md`](../2026-07-10/documents-domain.md) |

---

*Last updated after smoke pass + D8 `editor-overrides` fix. Editor v1 code-complete; optional manual checks in smoke doc.*
