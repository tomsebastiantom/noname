# Client architecture vs. upstream json-render reference patterns

> **Note on scope:** at the user's request, this file deliberately sets aside the internal `skills/spec-driven-ui/SKILL.md` rules (see [`SPEC-DRIVEN-UI-COMPLIANCE.md`](./SPEC-DRIVEN-UI-COMPLIANCE.md) for that comparison) and instead checks `packages/client` against the **upstream `@json-render/*` library itself** — its README, its official example apps, and its actual shipped source (`packages/react/src/contexts/*`, `packages/react/src/hooks.ts` in [vercel-labs/json-render](https://github.com/vercel-labs/json-render), version `0.19.0`, fetched live for this audit).
>
> **Why this matters more than it sounds:** `packages/client/package.json` and `packages/extensions/package.json` already depend on `@json-render/core@^0.19.0` and `@json-render/react@^0.19.0` — the exact latest published version (verified via `npm view`). Every pattern below isn't "an outside library we could adopt" — it's **code already installed in `node_modules` that the client is not using**, in places where using it would directly fix findings from `ARCHITECTURE.md` and `EFFICIENCY-PERFORMANCE.md`.

---

## 1. The library already ships a JSON-Patch–based diff/apply mechanism — the client hand-rolls `JSON.stringify` diffing instead

This is the single highest-leverage finding in this file.

**What's already installed** (`node_modules/@json-render/core`, confirmed via its type exports): `diffToPatches`, `applySpecPatch`, `applySpecStreamPatch`, `createSpecStreamCompiler`. These exist specifically so consumers can compute and apply **structural** diffs between two spec trees — RFC 6902-style JSON Patch operations (`add`/`remove`/`replace`/`move`/`copy`) — instead of comparing whole serialized trees.

**What the client actually does**, per `EFFICIENCY-PERFORMANCE.md`:

```174:209:packages/client/src/editor/collab/automerge-spec.ts
if (JSON.stringify(prevVal) === JSON.stringify(nextVal)) continue;
// ...
if (JSON.stringify(prevEl.props) !== JSON.stringify(nextEl.props)) { /* ... */ }
if (JSON.stringify(prevEl.children) !== JSON.stringify(nextEl.children)) { /* ... */ }
```

```239:246:packages/client/src/editor/collab/use-layout-collab.ts
if (pendingLocal && specJson(pendingLocal) !== specJson(remoteDoc)) { /* ... */ }
if (editorSpec && specJson(current) !== specJson(editorSpec)) { /* ... */ }
```

```66:69:packages/client/src/editor/hooks/use-content-draft.ts
return JSON.stringify(values) !== JSON.stringify(baseline);
```

Every one of these is re-solving the exact problem `diffToPatches`/`applySpecPatch` already solve, and doing it less efficiently (full-tree stringify instead of structural walk) and less usefully (a boolean "did it change" instead of a list of exactly *what* changed, which is what a real diff/patch would give you for free — e.g. to only re-render or re-sync the changed subtree instead of the whole document).

**Recommendation:** replace the `automerge-spec.ts` field-by-field `JSON.stringify` comparisons and `use-content-draft.ts`'s dirty check with `diffToPatches(baseline, current)` (checking if the resulting patch array is empty, and using the patches themselves to drive the Automerge sync instead of a hand-written props/children diff). This is not a "nice to have" — it's using the library the project already depends on for the exact thing it was built for.

---

## 2. The library ships pre-split `StateProvider` / `VisibilityProvider` / `ActionProvider` contexts — the editor uses one monolithic context instead

Official React contexts source (`packages/react/src/contexts/`) confirms `@json-render/react` is architected as **three independent contexts**, composed by the consumer:

```tsx
// examples/dashboard/lib/render/renderer.tsx (official example, verified live)
<StateProvider initialState={state} onStateChange={onStateChange}>
  <VisibilityProvider>
    <ActionProvider handlers={actionHandlers}>
      <Renderer spec={spec} registry={registry} fallback={fallback} loading={loading} />
    </ActionProvider>
  </VisibilityProvider>
</StateProvider>
```

This split exists so that a component reading only state doesn't re-render when only an action's `loadingActions` set changes, and vice versa — it's the exact "split contexts to reduce re-render blast radius" fix `EFFICIENCY-PERFORMANCE.md` recommends, already built into the library.

**The client's own runtime shell for admin/storefront correctly leans on this** (`platform/catalog-ui-shell.tsx` uses `createStateStore` + wraps `ActionProvider`/`JSONUIProvider` per the library's pattern). But the **editor** doesn't reuse this primitive — it builds `EditorSessionProvider` as one context carrying a single `sessionData` object with ~24 dependencies (`use-edit-page-orchestration.ts:494-549`, see `ARCHITECTURE.md` and `EFFICIENCY-PERFORMANCE.md`), so a change to any one of 24 unrelated fields (including live collab peer presence) invalidates and re-renders everything downstream.

**Recommendation:** decompose `EditorSessionProvider` along the same lines the library already models — a state-ish concern (draft/spec data), a visibility/selection concern, and an actions concern — as separate contexts, the same way `StateProvider`/`VisibilityProvider`/`ActionProvider` are separate upstream. This is a proven pattern already running successfully in the platform shell; it just wasn't extended to the editor.

---

## 3. The library's own `ActionProvider` handler-stability pattern is more disciplined than the editor's ad hoc version

Official `ActionProvider` (`packages/react/src/contexts/actions.tsx`) keeps `execute`'s identity stable across renders using `useCallback` with a deliberately narrow dependency list (`[handlers, get, set, getSnapshot, navigate, validation]` — none of which change on a per-keystroke basis), and the official dashboard example goes further, using **ref getters** so handlers never need to be recreated at all:

```tsx
// examples/dashboard/lib/render/renderer.tsx (official example, verified live)
const stateRef = useRef(state);
const setStateRef = useRef(setState);
stateRef.current = state;
setStateRef.current = setState;

const actionHandlers = useMemo(
  () => createHandlers(() => setStateRef.current, () => stateRef.current),
  [], // stable forever — reads latest via ref, not dependency
);
```

The client's `editor-session.tsx` already partially does this for the **actions** half (`actionsRef` + `useMemo(() => ({...}), [])` for `stableActions`), which is good and matches the library's own idiom. But the **data** half — `sessionData` — is not given the same treatment; it's a plain `useMemo` with a large, frequently-changing dependency array instead of being split the way the library splits state from actions in the first place (see #2).

**Recommendation:** apply the same ref-getter discipline already used for `stableActions` to the pieces of `sessionData` that change independently (e.g. collab presence vs. draft content vs. selection) — or, better, just adopt the 3-context split from #2, which makes this a non-issue by construction.

---

## 4. Registry composition is a plain object spread upstream — the client's `as never` casts are self-inflicted, not required by the library

Official registry composition, in every example checked (`next-website-builder`, `dashboard`, shadcn/React Native):

```tsx
// examples/next-website-builder/lib/registry.tsx (official example, verified live)
export const { registry } = defineRegistry(catalog, {
  components: { ...shadcnComponents, ...websiteComponents },
  actions: {},
});
```

No cast, no `as never`, no type-erasure anywhere in the upstream examples' registry files. The client's registries do this instead:

```10:10:packages/client/src/platform/registry.ts
actions: coreActionHandlers as never,
```

```42:42:packages/client/src/editor/registry.ts
actions: editorActionHandlers as never,
```

This means the type mismatch being papered over is **not** a limitation of `defineRegistry` — it's a mismatch between how the client's own action-handler maps are typed versus what `defineRegistry`'s generic signature expects, most likely because the client's `coreActionHandlers`/`editorActionHandlers` objects are built up incrementally from several partial maps with slightly different inferred shapes rather than declared as one object literal against the catalog's action schema type up front (which is how every upstream example does it — one literal object, typed inline).

**Recommendation:** this is very likely fixable, not a permanent constraint — try declaring `coreActionHandlers` and `editorActionHandlers` as single object literals typed directly against their catalog's inferred action-params type (the same shape `defineRegistry(catalog, { actions: {...} })` expects inline in the upstream examples) rather than assembling them from separately-typed partial maps and merging. If a genuine limitation is found, it's worth reporting upstream — a 15.9k-star, actively maintained library likely wants to know if `defineRegistry` can't type-check a legitimately-shaped multi-module handler map.

---

## 5. The reference "website builder" example is a JSON editor + live preview split-pane — not a drag-and-drop canvas

This directly explains, without excusing, why the client's visual editor is so much larger than everything else in the codebase. `examples/next-website-builder` — the upstream example closest in purpose to the client's visual editor — is architecturally simple: a raw spec-JSON tree editor (`@visual-json/react`'s `JsonEditor`) in one resizable pane, and a live `PageRenderer` preview in the other, with a 500ms-debounced `fetch` PUT to persist (`components/editor.tsx`, ~140 lines total, verified live). There is no drag-and-drop, no layer tree, no selection/marquee, no undo stack beyond what the JSON editor widget provides natively.

The client's editor — `EditorCanvas.tsx` (592 lines), `LayerTreePanel.tsx` (430 lines), `use-edit-page-orchestration.ts` (608 lines), plus collab, undo/redo, and agent-target wiring on top — is solving a materially harder UX problem than the reference app demonstrates. That's a legitimate, deliberate product scope decision (a visual drag-and-drop canvas is a better editing experience than raw JSON for non-technical users), not an architecture mistake. But it means:

- The god-file findings in `ARCHITECTURE.md` for the editor layer should be triaged as "genuinely complex product surface, budget real engineering time to decompose" rather than "should have been thin like everything else."
- There is no upstream reference implementation to copy from for the canvas/DnD/layer-tree layer specifically — those files are bespoke and need their own test/perf investment (see `MAINTAINABILITY.md`'s test-coverage section), because the library isn't carrying that weight for you the way it carries the registry/action/state layers.

---

## 6. The library's own hooks call `fetch` directly — the "never fetch in a component" rule needs a sharper boundary than a blanket ban

`useUIStream` and `useChatUI` (`packages/react/src/hooks.ts`, both shipped by `@json-render/react` itself) call `fetch(...)` directly, with manual `ReadableStream` reading, `AbortController` handling, and `setState` calls — not routed through any action/handler abstraction. The reference dashboard's top-level `page.tsx` and the website-builder's `editor.tsx` do the same for widget CRUD/reorder and spec save, respectively (all verified live above).

The distinction the library actually draws is **not** "fetch is forbidden in `.tsx` files." It's: components that are **registered in a catalog and addressed by a spec tree** (`Card`, `Metric`, `Button` in the Quick Start; `AdminNav`, `ReferenceFieldInput` in the client's case) never fetch — they receive data as props/state and emit actions. Components that **own the spec/data lifecycle from outside the tree** (a page, a hook, a host shell) fetching data and feeding it into `initialState` or the registry's action handlers is exactly how the library's own examples and its own hooks are built.

This matters for how `SPEC-DRIVEN-UI-COMPLIANCE.md`'s violations should be triaged and how any future skill rewrite should state the rule: `AdminNav.tsx` and `DocumentShareField.tsx` calling `fetch()` directly (flagged there) are catalog-registered components, so they're genuinely off-pattern by the library's own logic — not just by the stricter internal skill. But if a future skill rewrite bans fetch too broadly (e.g. in `main.tsx`'s host-level `loadPage`, which is not a catalog component), it would be **stricter than the library it's built on**, which isn't necessarily wrong for this project's needs, but should be a deliberate choice, not an accident of copying a blanket rule.

---

## 7. The library ships an i18n directive (`$t`) via `@json-render/directives` — not currently used, and it's a ready-made answer to the "hardcoded copy" finding

The root README lists `@json-render/directives` (pre-built custom directives: `$format`, `$math`, `$concat`, `$count`, `$truncate`, `$pluralize`, `$join`, and **`$t` for i18n**). Neither `packages/client/package.json` nor `packages/extensions/package.json` lists `@json-render/directives` as a dependency, and `createDirectiveRegistry`/`defineDirective` (exported by the already-installed `@json-render/core`) aren't referenced anywhere in `packages/client/src` (unverified beyond a grep — worth double-checking before relying on this).

`SPEC-DRIVEN-UI-COMPLIANCE.md` and the prior `CLIENT-UI-ARCHITECTURE-AUDIT.md` both flag "no localization mechanism, `labels` are English-only fallback strings" as an open gap. Before building a bespoke locale system, it's worth evaluating whether `@json-render/directives`' `$t` directive (or a project-specific directive built with the already-installed `defineDirective`/`createDirectiveRegistry`) covers this more cheaply than a custom-built i18n layer, since the catalog/registry/expression machinery it plugs into is already the client's runtime.

---

## 8. Upstream has zero concept of the CMS/persistence layer — your platform's biggest architectural addition isn't covered by any `@json-render` skill, and a rewritten skill must say so explicitly

This is worth stating plainly because it's easy to miss when comparing against upstream skills: **`json-render` itself has no opinion on where a spec comes from.** Checked directly against the upstream `skills/core/SKILL.md` and `skills/react/SKILL.md` (fetched live, full text reviewed) plus the full list of 26 upstream skills (`core`, `react`, `vue`, `svelte`, `solid`, `directives`, `xstate`/`redux`/`zustand`/`jotai` state adapters, `next`, `mcp`, `devtools`, `codegen`, media renderers) — **none of them mention content management, drafts, publishing, versioning, multi-tenancy, or persistence of any kind.** The library's own examples generate specs from AI prompts (`buildUserPrompt`, `useUIStream`) or hardcode them in a file (`default-spec.ts`); the website-builder example persists the *whole spec* as one opaque JSON blob behind a generic `PUT /api/spec`, with no notion of "content type," "entry," "draft vs. published," or "reference" at all.

Your platform's `documents` domain — layout documents as a distinct concept from content entries, content-type schemas, refs/label resolution, draft/publish workflow, per-org tenant settings, the whole `templateFromPath → layout document → GET /api/edge/schema → <Renderer spec={…}>` pipeline described in `skills/spec-driven-ui/SKILL.md` — is **entirely your own addition on top of the rendering engine.** It's the thing that turns a generic "render JSON as UI" library into a multi-tenant CMS platform, and it's also where a large share of this whole audit's findings actually live: the unpaginated `documents` list endpoints (`SCALABILITY.md`), the 493-line `documents/ports.ts` and `contracts.ts` duplication (`ARCHITECTURE.md`/`MAINTAINABILITY.md`), the hard-coded content-type field-type `if`-chain and multi-touch-point admin-panel registration (`EXPANDABILITY.md`) are all in this layer, not in the `@json-render` rendering layer itself.

**Why this matters for any future skill rewrite:** if `skills/spec-driven-ui/SKILL.md` (or whatever replaces it) is restructured to mirror upstream's per-package skill format, there's a real risk of only documenting the parts upstream already documents (catalog/registry/actions/state — sections 1-7 above) and leaving the CMS/persistence layer as tribal knowledge again, since there's no upstream skill to crib from or hold it accountable to. That layer needs **its own explicit section** — covering the documents domain's contract with the rendering layer (how a layout document becomes a `Spec`, how content entries become `initialState`, how refs resolve, how the draft/publish lifecycle interacts with the edge schema cache) — written from scratch, because nothing upstream will ever cover it. This is also exactly the layer `EXPANDABILITY.md`'s "adding a domain requires touching ≥4 files" and "adding an admin panel requires ≥7 touch points" findings describe — worth cross-referencing directly when that section gets written, since those frictions are inherent to the layer you built, not to `@json-render`.

---

## Summary — what to actually do with this

Unlike most of this audit, these aren't "fix a bug" items — they're "you're paying to maintain code that duplicates a dependency you already ship" items. Ranked by leverage:

1. **Adopt `diffToPatches`/`applySpecPatch`** in the collab/draft-dirty-checking hot paths (§1) — directly fixes the `JSON.stringify` efficiency findings with a library primitive built for exactly this.
2. **Split the editor session context** using the same `StateProvider`/`VisibilityProvider`/`ActionProvider` shape the platform shell and every upstream example already use (§2, §3) — directly fixes the 24-dependency re-render blast radius finding.
3. **Fix the two `as never` casts** by typing `coreActionHandlers`/`editorActionHandlers` as single literals against the catalog's action schema, the way every upstream example does it (§4) — turns on a real compiler check.
4. **Evaluate `@json-render/directives`' `$t`** before building custom i18n (§7).
5. Treat the canvas/DnD/layer-tree editor layer as bespoke, budget it accordingly, and don't expect it to shrink to "upstream-example size" (§5) — it's solving a harder problem than the reference app.
6. When rewriting `skills/spec-driven-ui/SKILL.md`, state the fetch rule as "no `fetch()` inside components registered in a catalog registry," not "no `fetch()` in components," since the latter is stricter than the library's own examples and hooks (§6).
7. **Treat the CMS/documents/persistence layer as its own required section in any future skill**, written from scratch rather than adapted from an upstream skill — no upstream `@json-render` skill covers it, because the library has no concept of it (§8). This is also where most of `EXPANDABILITY.md`'s multi-touch-point findings live, so that section should cross-reference this layer explicitly rather than being folded into general "how to add a component" guidance.
