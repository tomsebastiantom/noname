# Editor Layout CSS: Cascade-Layer Best Practice
## As of 2026-08-22

---

## Overview

This note documents a styling bug found in the **visual editor layout** and the best-practice decision we made to fix it properly rather than with a one-off patch. It covers **why** Tailwind utilities were being ignored, **why** panel content was clipping instead of scrolling, and **how** we aligned the editor's hand-written CSS with Tailwind v4's cascade-layer model.

**Location:** `packages/client/src/editor/components/shell/editor-layout.css` and `EditorLayout.tsx`

---

## The Problem

Two related symptoms were reported on the edit page:

1. **Floating side panels clipped their content with no scrollbar.** On a narrow window the blocks/props panels floated above the canvas, and content taller than the panel was cut off — the user could not scroll down.
2. **Tailwind utilities appeared to be ignored.** The panel body carried `overflow-y-auto` in the JSX, yet the panel never scrolled.

Both symptoms share one root cause.

---

## Root Cause: Unlayered CSS Beats Tailwind's Utility Layer

Tailwind v4 emits its utilities inside a cascade layer:

```css
@layer theme, base, components, utilities;
@layer utilities { .overflow-y-auto { overflow-y: auto; } ... }
```

Our custom component rules in `editor-layout.css` were written **outside** any layer:

```css
.editor-layout-panel-body { overflow: hidden; }
```

Per the CSS cascade spec, **unlayered styles beat layered styles** — regardless of order or specificity. So even though an element had both `.editor-layout-panel-body` (unlayered, `overflow: hidden`) and `.overflow-y-auto` (layered utility), the unlayered `overflow: hidden` always won. Result: both axes were hidden → content clipped, no scrollbar.

> The utility was present; it simply lost the cascade. This is the "surprise" class of bug that mixing unlayered hand-written CSS with a utility-driven framework invites.

### Secondary root cause: a flex container with `overflow-y: auto` does not scroll

Even after letting the body scroll, the panel body was `display: flex; flex-direction: column`. A flex container that is also a scroll container sizes its growing flex item to exactly the container height and **clips it** instead of overflowing-and-scrolling. Confirmed empirically: rendering the same body as a **block** scroll container made the scrollbar appear and content scroll, while the `display: flex` variant did not — even with `flex-shrink: 0`/`flex: 0 0 auto` on the child.

This is exactly why the **stacked** (blocks + layers) panel scrolled but **blocks-alone** did not: the stacked case wraps the palette in a plain block `min-h-0 flex-1 overflow-y-auto` div (`EditorLeftPanel.tsx`), while the blocks-alone case put the palette directly as a flex item of the flex body.

---

## Decision: Follow Tailwind v4's Idiomatic Layer Pattern

Rather than patch the symptom, we made the editor's custom CSS play by Tailwind's rules:

1. **Wrap the editor's component CSS in `@layer components`.**
   Put the `.editor-layout-*` rules inside `@layer components { ... }`. Because `utilities` is declared after `components`, Tailwind utilities now intentionally override component styles. Layering becomes explicit and the whole class of "utility silently ignored" bugs is gone.

   ```css
   @layer components {
     .editor-layout-panel-body { ... }
     ...
   }
   ```

2. **Make the panel body a block scroll container.**
   `.editor-layout-panel-body` is now `overflow: hidden auto` and is **not** `display: flex`, so its content overflows and scrolls. The agent/stacked bodies that need a flex column re-enable `display: flex; flex-direction: column` on their own variants (`.editor-layout-panel-body--agent`, `.editor-layout-panel-body--stacked`).

3. **Reconcile a conflicting utility.**
   The canvas element carried a Tailwind `min-w-0` that would now override the component rule `min-width: var(--editor-canvas-min)` (it sits in `@layer utilities`). Removed `min-w-0` from the canvas JSX so the component layer controls the min width (280px on large screens, `0` via the media query on small screens).

4. **Fixed two invalid declarations.**
   `shrink: 0` (not a real CSS property) → `flex-shrink: 0` on the panel header and the layers-dock header.

---

## Changes Made

| File | Change |
|------|--------|
| `packages/client/src/editor/components/shell/editor-layout.css` | Wrapped all `.editor-layout-*` rules in `@layer components`; panel body became a block `overflow: hidden auto` scroll container (`--agent`/`--stacked` re-enable flex); `shrink: 0` → `flex-shrink: 0`. |
| `packages/client/src/editor/components/shell/EditorLayout.tsx` | Removed the now-redundant `min-w-0` from the canvas element so the component layer's canvas min width is respected. |

Related, already-committed fixes in the same file: floating-panel opacity, softened drop shadow (`0 12px 32px rgba(0,0,0,.28)` → `0 8px 24px rgba(0,0,0,.12)`), and docking the right floating panel flush (`right: 0`).

---

## Best Practice Going Forward

- **Hand-written component CSS belongs in `@layer components`.** If a rule is meant to be overridable by a utility, it must live in a layer that utilities outrank. Unlayered custom CSS silently defeats Tailwind utilities.
- **Scroll containers:** for a vertically scrolling column, use a **block** scroll container (`overflow-y: auto` + `min-height: 0`). Avoid making the scroll container itself a flex container that grows its only child into a clip.
- **Don't fight the cascade; use it.** If a utility should be able to win, keep the base rule in a lower-priority layer instead of adding `!important` or a more specific selector.

---

## Verification

- Confirmed via static reproductions (Chrome headless) at small viewport widths:
  - Blocks-alone and props panels now show a vertical scrollbar and scroll their content.
  - Horizontal overflow is clipped (no horizontal scrollbar) while vertical scrolling works.
  - The docked (>899px) and floating (≤899px) layouts still lay out correctly.
- Rebuilt the client (`pnpm --filter @noname/client build`, via `rspack build`) with no errors; inspected the compiled chunk and confirmed `.editor-layout-panel-body{...overflow-x:hidden;overflow-y:auto}` and `.editor-layout-panel-body--agent{...display:flex}`.

> Caching note: the rspack dev server pushes HMR updates only to connected tabs, so a stale tab (or a separate browser-MCP context) can keep an older bundle until a hard refresh (`Ctrl+Shift+R`) or a dev-server restart. This is a browser/module cache artifact, not a code regression.
