# Client UI architecture audit

> **Date:** 2026-08-01  
> **Scope:** `packages/client` — visual editor, admin catalog, host shell, auth  
> **Baseline:** [skills/spec-driven-ui/SKILL.md](../../skills/spec-driven-ui/SKILL.md) · [props-contract.md](../../skills/spec-driven-ui/props-contract.md)  
> **Related:** [VISUAL-EDITOR-GAP-ANALYSIS.md](./VISUAL-EDITOR-GAP-ANALYSIS.md) · [FIELD-ACL.md](./FIELD-ACL.md)

Static review of current code against spec-driven UI rules, plus accessibility, maintainability, and performance notes. Not a runtime profile.

---

## Executive summary

| Area | Grade | Headline |
|------|-------|----------|
| **Admin catalog panels** | **B+** | Mostly compliant: `config`+`labels`, `useMountAction`, sync handlers |
| **Visual editor** | **C+** | Shell labels spec-driven; orchestration bypasses catalog actions |
| **Host / routing** | **C** | Custom template map OK; `?edit=true` and OAuth are imperative bypasses |
| **Spec-driven props** | **B** | Catalog schemas good; sub-widgets and TS fallbacks still hold copy |
| **Accessibility** | **C+** | Chrome aria solid; canvas/layer keyboard and live regions weak |
| **Performance** | **C+** | Sensible memos; session context fan-out is main cost |
| **Maintainability** | **B−** | Clear layers; several 400–500 line files, editor↔admin coupling |

**Top 3 fixes (architecture):**

1. Wire **editor catalog actions** — schemas exist, `editor/registry.ts` registers `actions: {} as never`; hooks call admin API directly.
2. Stop **direct API in editor hooks** — `use-layout-draft`, `use-content-draft`, `use-editor-prefs` should use handlers + `$state`.
3. **Decouple editor from admin** — re-exports and `adminComponentSchemas` import; move shared domain to neutral modules.

**Top 3 fixes (a11y / perf):**

1. Split **editor session context** to reduce re-render blast radius.
2. **Canvas keyboard entry** — tab focus, selection announcements, layer tree roving tabindex.
3. Use **`labelsMissingHint`** and **`aria-live`** on save/error states.

---

## What follows the architecture (keep)

- No react-router org UI tree; routing via host template map + layout documents.
- `CatalogUiShell` — synchronous `handlers()` on `JSONUIProvider` (no `registerHandler` in `useEffect`).
- Admin panels widely use **editable draft** pattern: `useMountAction` → `loadedAt` → `key` → `useCatalogSubmit`.
- Catalog component schemas use **`catalogProps(config, labels)`**; panels read `props.labels.*`.
- Editor **shell chrome** (~90 label keys) driven by `visual_editor` layout + `editorShellLabelsSchema`.
- Editor **block/field labels** from storefront Zod introspection (`edit-metadata.ts`), not hardcoded per block.
- Layout-level **`MountAction`** in seeds for team list, flags, session replay (read-only lists).

---

## Spec-driven UI violations

### Critical — bypass the catalog pipeline

| Issue | Where | Detail |
|-------|-------|--------|
| Editor host bypass | `main.tsx` | `?edit=true` lazy-loads `EditorHost` instead of edge schema + `VisualEditorShell` layout |
| Editor actions unimplemented | `editor/registry.ts:39` | `editorActionSchemas` defined; handlers map is `{} as never` |
| Direct API in editor hooks | `use-layout-draft.ts`, `use-content-draft.ts`, `use-editor-prefs.tsx` | Mount/save via admin API re-exports, not `execute` |
| OAuth callback page | `auth/callback-page.tsx`, `main.tsx` | Standalone React page (documented exception, but not spec-driven) |

### High — components call APIs instead of actions

| File | Pattern |
|------|---------|
| `core/components/LoginForm.tsx` | `useEffect` + `fetch('/api/auth/.../config')` on mount |
| `admin/components/team/AccountSecurityForm.tsx` | `fetchAuthSessionStatus`, `startTotpEnrollment` from component |
| `admin/components/content/ReferenceFieldInput.tsx` | `listEntries`, `getContentType` on mount |
| `admin/components/content/MediaFieldInput.tsx` | `getAsset` on mount; upload from component |
| `editor/hooks/use-editor-shell-labels.ts` | Direct layout fetch instead of action / layout preload |

### Medium — routing and structure outside layout specs

| Issue | Where |
|-------|-------|
| Pathname → template map in TS | `platform-routes.ts` (acceptable v1; page_tree is future) |
| Admin sub-router by pathname | `PageRoutingAdmin.tsx` switches tree vs entry by URL |
| Hand-written admin page UX | `PageEntryAdmin`, `PageTreeAdmin` — catalog components but dense imperative UI |

### Medium — editor imports admin layer

| File | Coupling |
|------|----------|
| `editor/layout-entries.ts` | Re-exports `admin/layout-entries` |
| `editor/content-entries.ts` | Re-exports `admin/content-entries` |
| `editor/content-fields.ts` | Imports admin field widgets |
| `editor/lib/editor-overrides.ts` | Imports `adminComponentSchemas` |

**Target:** shared `documents/` or `domain/` client modules; editor uses catalog actions only.

---

## Hardcoded copy (props-contract gaps)

User-visible strings still in `.tsx` or TS defaults (should be `props.labels` or layout seed):

| Area | Examples |
|------|----------|
| **Editor** | `EditPageView` missing-labels error (ignores `labelsMissingHint`); `editor-gate.tsx` load/error strings |
| **Admin pages** | `PageEntryAdmin`, `LayoutEntryAdmin` — table headers, empty states, field labels |
| **Account security** | `AccountSecurityForm` — MFA copy, sign-in prompts |
| **CMS widgets** | `ReferenceFieldInput`, `content-entry-type-list`, `content-entry-create-form` |
| **Schema defaults** | `AccountSecurityForm` Zod defaults; `login-branding.ts`, `login-form-labels.ts` fallbacks |
| **Host** | `main.tsx` loading/error (allowed as host exception; still English-only) |

**Internal helpers with flat props** (not catalog nodes): `AdminNav`, `AdminPageHeader`, `ReferenceFieldInput`, `MediaFieldInput` — accept flat `title`/`label` instead of `config`+`labels`.

---

## Visual editor — detailed findings

### Architecture (good)

```
EditPageView → EditorSessionProvider → Renderer(editorRegistry) → VisualEditorShell
  → slots: palette | layers | canvas | props
  → canvas previews storefront via merged registry + CatalogUiShell
```

- Session covers selection, drafts, undo/redo, conflict refresh, preview width.
- Preview pipeline: stored spec → content merge → pending add → structure-key remount.
- Prefs (`editor_prefs` content type) separated from layout labels.

### Architecture (gaps)

| Severity | Issue |
|----------|-------|
| **High** | `EditPageView` (~485 lines) owns all orchestration — hard to test/extend |
| **High** | Single session context ~40 deps — any edit re-renders all shell slots |
| **Medium** | Dual pin paths: `EditorPrefsProvider` vs `usePalettePins` in palette |
| **Low** | Schema lists 3 slots; runtime expects 4 (layers implicit via fallbacks) |

### Spec-driven (good)

- Save bar, panels, canvas chrome use `labels.*` from layout.
- Drop hints use templates with `{block}`, `{parent}`, `{slot}`.
- Field controls driven by schema introspection.

### Spec-driven (gaps)

| Severity | Issue |
|----------|-------|
| **Medium** | Hardcoded dev error when labels missing — should use `labelsMissingHint` |
| **Low** | Literal `+`, `×`, `⠿` on buttons; enum options show raw values |
| **Low** | Loading state: `aria-busy` with empty content |

### Accessibility

| Severity | Issue | Recommendation |
|----------|-------|----------------|
| **High** | Canvas `tabIndex={-1}` — shortcuts only after click | `tabIndex={0}`, document shortcuts in spec labels |
| **High** | Layer tree mouse-only — no arrows / roving tabindex | WAI-ARIA tree pattern |
| **Medium** | `role="application"` on canvas isolates SR users | Prefer `region` + live region for selection |
| **Medium** | Save/error/conflict — no `aria-live` | `role="status"` on SaveBar alerts |
| **Medium** | Reorder drag-only (layers, canvas drop) | Keyboard reorder or documented limitation |
| **Low** | Selection via `data-editor-selected` only — not announced | Live region on selection change |
| **Low** | Long-text textarea missing explicit `htmlFor` link | Associate label with control id |

### Performance

| Severity | Issue | Recommendation |
|----------|-------|----------------|
| **High** | Session fan-out re-renders canvas + full layer tree on every keystroke | Split contexts; memo leaf panels |
| **Medium** | Three `useLayoutEffect`s sync DOM attrs on every `previewSpec` change | Batch or derive from React tree where possible |
| **Medium** | History dedup via `JSON.stringify(spec)` | Structural hash or shallow compare |
| **Medium** | Layer tree full recursive render — no virtualization | Virtualize if > ~50 nodes |
| **Low** | Panel resize writes prefs every `pointermove` | Throttle or commit on pointerup |
| **Low** | `editMetaForType` cache — **good**; history debounce 450ms — **good** |

### Maintainability

| File | Lines | Concern |
|------|-------|---------|
| `EditorCanvas.tsx` | ~524 | DnD + keyboard + DOM effects + preview |
| `EditPageView.tsx` | ~485 | God orchestrator |
| `LayerTreePanel.tsx` | ~430 | Tree + DnD + collapse state |
| `PropsPanel.tsx` | ~371 | Repeated aside wrappers |
| `spec-utils.ts` | ~526 | Spec mutation helpers |

**Recommendations:** extract `useEditorActions`, memo `EditorCanvas`/`LayerTreePanel`/`PropsPanel`, dedupe PropsPanel aside branches.

---

## Admin catalog — detailed findings

### Compliant patterns (reference implementations)

| Panel | Pattern |
|-------|---------|
| `AuthSettingsForm` | `useMountAction` + `useCatalogSubmit` + `key={loadedAt}` |
| `ContentEntryAdmin` | Dynamic `useMountAction` params from URL |
| `LayoutEntryAdmin` | Same |
| `UsersAdminForm` | Layout `MountAction` + `$state` read |
| `FeatureFlagsAdmin`, `SessionReplayAdmin` | MountAction in seed |

### Gaps

| Panel / widget | Gap |
|----------------|-----|
| `AccountSecurityForm` | No layout `MountAction`; direct auth API; hardcoded MFA copy |
| `ReferenceFieldInput`, `MediaFieldInput` | Sub-components with mount fetch — not catalog nodes |
| `PageEntryAdmin`, `LayoutEntryAdmin` | Many hardcoded labels; could move to layout `labels` |
| `PageRoutingAdmin` | Client pathname switch — could be two layout templates |
| `LoginForm` | Provider config via fetch, not `$state`/action |

---

## Cross-cutting recommendations

### P0 — architecture (spec-driven)

| # | Task | Effort |
|---|------|--------|
| 1 | Implement editor action handlers; wire `editor/registry.ts` | M |
| 2 | Refactor editor hooks to `execute` / `$state` | M |
| 3 | Extract shared document client modules out of `admin/` | M |
| 4 | Move admin sub-widget copy into layout seeds | L–M |
| 5 | LoginForm: load auth config via action or edge preload | S |

### P1 — accessibility

| # | Task | Effort |
|---|------|--------|
| 6 | Canvas tab focus + keyboard docs in labels | S |
| 7 | Layer tree roving tabindex + `aria-selected` | M |
| 8 | SaveBar `aria-live` for success/error/conflict | S |
| 9 | Use `labelsMissingHint`; loading hint label | S |
| 10 | Field controls: enum display labels; textarea `htmlFor` | S |

### P2 — performance & maintainability

| # | Task | Effort |
|---|------|--------|
| 11 | Split editor session context (selection / draft / actions) | M |
| 12 | `React.memo` on heavy editor leaves | S |
| 13 | Extract hooks from `EditPageView` | M |
| 14 | Cheaper history equality than full JSON stringify | S |
| 15 | Virtualize layer tree (when depth warrants) | M |

### P3 — defer / product decision

| Item | Notes |
|------|-------|
| Full editor via edge schema (no `EditorHost` bypass) | Aligns with skill; larger host refactor |
| OAuth callback as layout | Thin handler may stay exception |
| `platform-routes.ts` → page_tree | Routing product roadmap |
| Field ACL in PropsPanel | See [FIELD-ACL.md](./FIELD-ACL.md) |
| Collab / CRDT | See [VISUAL-EDITOR-COLLAB-CRDT.md](./VISUAL-EDITOR-COLLAB-CRDT.md) |

---

## Violation checklist (for PR review)

Use when touching client UI:

```
- [ ] No new hand-written route pages for org UI
- [ ] No fetch() in catalog components — handlers only
- [ ] Copy in props.labels or layout seed — not TSX literals
- [ ] New catalog components: catalogProps(config, labels)
- [ ] Mount load: MountAction or useMountAction — not useEffect+fetch
- [ ] Editor code does not import admin/*
- [ ] New editor strings: editorShellLabelsSchema + layout seed
- [ ] Interactive UI: keyboard path + aria where applicable
```

---

## Doc map

| Question | Read |
|----------|------|
| **This audit** | **this file** |
| Editor feature status | [VISUAL-EDITOR-GAP-ANALYSIS.md](./VISUAL-EDITOR-GAP-ANALYSIS.md) |
| Agent build rules | [skills/spec-driven-ui/SKILL.md](../../skills/spec-driven-ui/SKILL.md) |
| Field ACL backlog | [FIELD-ACL.md](./FIELD-ACL.md) |
| Smoke test log | [EDITOR-SMOKE-PRODUCT-DETAIL.md](./EDITOR-SMOKE-PRODUCT-DETAIL.md) |

---

*Generated from static analysis of `packages/client`. Re-run after major editor or admin refactors.*
