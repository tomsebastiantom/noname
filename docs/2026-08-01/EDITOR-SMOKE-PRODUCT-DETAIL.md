# Editor smoke — product page (A5 + B6 + C9)

> **URL:** `http://yogastore.localhost:5173/products/demo-sneakers?edit=true`  
> **Login:** `admin@zitadel.localhost` (demo seed)  
> **Last run:** 2026-08-05 — browser pass (duplicate, drag, delete, publish, exit)

## Note on layout template

Scope banner shows **`home`** (not `product_detail`) for this URL — demo routing uses the shared home layout with a linked **product** content entry. Editor behaviour is the same; rename checklist if you add a dedicated `product_detail` layout later.

---

## Prerequisites

```bash
pnpm dev                          # API :3000
pnpm --filter @noname/workers dev # edge :8787
pnpm --filter @noname/client dev  # client :5173
pnpm seed:demo                    # editor_prefs + visual_editor layout
```

---

## A5 — Clarity

- [x] Scope banner shows layout template + content ref when linked
- [x] Edit a **Layout** field (Text block Content) → Save draft → reload → value persists
- [ ] Edit a **Content** field (product title on ProductCard) — *no ProductCard on this page; use a CMS-bound block or add commerce blocks to layout*
- [x] **Edit page** link in auth bar opens `?edit=true` — verified 2026-08-05 visitor view
- [x] Top **Save draft** vs panel **Save to page** copy is clear for pending blocks

## B6 — Structure

- [x] Open **Layers** panel; expand/collapse chevron on parent rows
- [x] With **both** Blocks + Layers open: **Hide blocks** → layers-only full sidebar
- [x] **Hide layers** → blocks-only — Close Layers leaves blocks palette open (2026-08-05)
- [x] Drag layer row to reorder sibling (blue line before/after) — promo/intro order swapped via drag handle
- [ ] Drag layer row onto Stack/Grid middle zone (dashed inside) — *not re-checked this run*
- [x] Canvas selection matches layer row selection
- [x] Delete block updates tree and canvas — Remove from layout + duplicate cleanup verified

## Phase C

- [ ] Selection chip shows component label on canvas — *visual; not asserted*
- [ ] Double-click or Shift+click selects parent block — *not re-checked*
- [x] **Duplicate block** button or ⌘D creates copy — Duplicate block in props panel verified
- [x] Enum field (Align / Variant) renders as select
- [x] Button **Action** field shows storefront action dropdown (D8) — `addToCart`, `navigate`, `checkout`
- [ ] Image/src field shows media picker — *no Image block selected this run*

## Phase D

- [x] Save bar strings load from `visual_editor` layout seed
- [x] Palette / layer / canvas aria labels load from shell labels
- [x] Shell slot order follows `visual_editor` spec children (`palette`, `layers`, `canvas`, `panel`)

## Post-v1 (2026-08-01)

- [x] **Responsive preview** — Desktop / Tablet / Mobile toolbar above canvas
- [ ] **Undo/redo** ⌘Z / ⌘⇧Z — *not re-checked this run*
- [x] **409 conflict** — stale `If-Match` → **409** — covered by `layouts.service.test.ts`; optional two-tab UI smoke
- [x] **D8 action picker** — Button → Action combobox (after removing stale `editor-overrides` hide)

## Cross-device prefs

- [ ] Collapse Blocks/Layers/Properties; reload → same state — *not re-checked*
- [ ] Pin a block; second session → pin persists — *not re-checked*

## Exit

- [x] Exit edit → visitor view matches saved draft — fixed SPA exit (`window.location.replace` without `?edit=`); verified 2026-08-05
- [x] Publish (admin) → visitor view shows published layout — Publish toolbar → visitor reload verified

---

## Fixes during smoke runs

| Issue | Fix |
|-------|-----|
| Button/Hero **Action** missing from props panel | Removed stale `hiddenFields` from `editor-overrides.ts` (2026-08-01) |
| Exit edit left editor chrome mounted | `exitEditMode` uses full navigation reload without `?edit=` (2026-08-05) |
| Dev HMR stale CSS blocked editor load | Stable dev asset names in `rspack.config.mjs` (2026-08-05, see E2E F9) |

---

## Remaining manual checks (optional)

1. Content-field save on a `$state`-bound block (e.g. ProductCard when on commerce layout)
2. Layer drag **reparent** onto Stack/Grid inside zone
3. Two-tab **409 conflict**
4. Undo/redo keyboard shortcuts
