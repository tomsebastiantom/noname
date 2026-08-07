# Proposal: rewrite `skills/spec-driven-ui/SKILL.md`

> **Status: applied 2026-08-07.** All five changes below were applied to `skills/spec-driven-ui/SKILL.md` and the "Host vs. catalog boundary" section was added to `skills/spec-driven-ui/reference.md`. This document is now a record of *why* those changes were made — see the live skill files for current wording. Next step: re-verify `SPEC-DRIVEN-UI-COMPLIANCE.md`'s findings against the finalized exception criteria before wiring `ACTION-PLAN.md` items 24–25 onto `MountAction`.
>
> **Inputs:** [`SPEC-DRIVEN-UI-COMPLIANCE.md`](./SPEC-DRIVEN-UI-COMPLIANCE.md) (where the current skill's rules are violated in practice), [`JSON-RENDER-REFERENCE-PATTERNS.md`](./JSON-RENDER-REFERENCE-PATTERNS.md) (what the upstream `@json-render` library's own docs/examples actually recommend), and the current [`skills/spec-driven-ui/SKILL.md`](../../skills/spec-driven-ui/SKILL.md).

---

## Why rewrite it (not just re-enforce it)

The current skill is well-written but has three concrete problems, each backed by evidence gathered earlier in this audit rather than by opinion:

1. **One rule is stricter than the library it's built on**, and the gap causes real confusion. "Never `fetch()` in components" (lines 130, 282, 337 of the current skill) is stated as an absolute. But `@json-render/react`'s own shipped hooks (`useUIStream`, `useChatUI`) call `fetch()` directly, and every official example app (`dashboard/app/page.tsx`, `next-website-builder/components/editor.tsx`) fetches from a top-level page/host component. The rule that actually holds, upstream and in this codebase's own correctly-built parts, is narrower: **components registered in a catalog registry never fetch; the host/page/hook layer that owns data lifecycle can.** The current wording doesn't draw that line, so violations and correct exceptions look identical to someone reading the rule literally.
2. **A whole architectural layer has no section at all.** The documents/CMS/persistence layer — layout documents, content types/entries, refs, draft/publish, edge-schema caching — is the platform's single largest addition on top of `@json-render`, and it's completely absent from the skill as a named concept. It's implied by the "Layout documents" line in the Skeleton section and the "Layout document" step in the build checklist, but never explained: where do layout documents live, how does a content entry become `$state`, what does draft-vs-published mean for the edge schema cache. New contributors currently have to reverse-engineer this from the `documents` domain's source.
3. **No enforcement hooks.** Every rule in the current skill is prose. `SPEC-DRIVEN-UI-COMPLIANCE.md` shows the same violations named in `docs/2026-08-01/CLIENT-UI-ARCHITECTURE-AUDIT.md` are still present a week later, in the same files. A skill that only a human (or an agent) reads *before* starting a task has no way to catch a violation introduced *during* the task.

None of this means the current skill's core model is wrong — the `config`+`labels` prop contract, the `MountAction`/`useMountAction` pattern, `useCatalogSubmit`, and the three-layer action model are all sound and match how the upstream library is actually meant to be used (`ActionProvider`, `StateProvider`, the registry pattern). The rewrite keeps all of that and fixes the three problems above.

---

## What changes, section by section

### 1. "What to call from components" table — narrow the fetch rule

**Before** (current skill, line ~282):

> | **Never** in components | `fetch("/api/…")` directly | Bypasses catalog validation; use action handler helpers |

**Proposed:**

> | **Never** in a component registered in a catalog registry | `fetch("/api/…")` directly | Bypasses catalog validation; use action handler helpers. This does **not** apply to the host shell / route page / a hook that owns a surface's data lifecycle from outside the spec tree (e.g. `main.tsx`'s `loadPage`, a `use*Stream` hook) — see [reference.md § Host vs. catalog boundary](reference.md#host-vs-catalog-boundary) for where that line is. |

Add a new subsection (proposed for `reference.md`, referenced from the main skill) that states the boundary precisely, with the upstream evidence:

> **Host vs. catalog boundary.** `@json-render/react`'s own hooks (`useUIStream`, `useChatUI`) call `fetch()` directly, and upstream's own example apps fetch from top-level pages (`dashboard/app/page.tsx`) and editor hosts (`next-website-builder/components/editor.tsx`). The rule this platform enforces is: a component **registered in any registry merged by `catalog-loader.ts`** — today `admin/registry.ts`, `editor/registry.ts`, `platform/registry.ts`, and `packages/extensions/src/*/registry.ts` (`commerce` today; more extensions and, per `MULTI_TENANT_CATALOG.md` Phase 3/4, tenant-private and marketplace registries loaded via Module Federation are planned) — i.e., addressable by a spec tree, however many catalogs are merged at runtime — never calls `fetch` and never imports API helpers directly; it receives data via props/`$state` and emits actions. A **host-level file** — `main.tsx`, a route-owning hook, a data-loading hook not registered as a catalog component — may fetch directly, the same way the library's own hooks do, because it owns a surface's lifecycle from *outside* the tree rather than being addressed *by* it.
>
> **Write this rule against "any registry the loader merges," not an enumerated list.** The list of registries is expected to grow — extensions beyond `commerce` (influencer, booking, membership, SaaS — named directly in `CLIENT-CATALOG-LAYERS.md`), then tenant-private and marketplace catalogs once Phase 3/4 ship. A rule that names three specific files will silently stop covering new catalogs as they're added; a rule anchored to "merged by the loader" doesn't need updating when catalog #5 arrives.

#### Why this rule exists (not just "because upstream does it")

This isn't a style preference — it's what makes the rest of the spec-driven model actually hold together. Note in the skill so the *reasoning* survives, not just the rule:

1. **It's the actual safety model, not a convention.** `@json-render`'s value proposition is *"Guardrailed — AI can only use components in your catalog"* and *"Predictable — JSON output matches your schema, every time."* Specs here are AI/CMS-generated and placed into components by name. If a catalog component can `fetch()` on its own initiative, the catalog schema no longer describes everything it can do — there's a side-channel an AI-generated or CMS-edited spec can't be constrained against. A component that only reads `props`/`$state` and emits declared actions is *fully* described by its catalog entry; one that fetches internally isn't.
2. **Loading/error/auth state gets handled once, centrally, instead of N times ad hoc.** `ActionProvider.execute()` already centralizes `loadingActions`, retries, auth headers, permission checks, and devtools instrumentation. A component fetching on its own re-implements (or skips) all of that — exactly what happened in `AccountSecurityForm`/`ReferenceFieldInput` (`SPEC-DRIVEN-UI-COMPLIANCE.md`), each with its own bespoke loading state instead of the one the framework already provides.
3. **Portability across renderers.** The same catalog concept can target React, Vue, Svelte, React Native, React PDF, React Email, Remotion. A component with an internal `fetch()`/`useEffect` can't run under renderers with no browser fetch context or effect loop. Pure `(props, state) → UI` components are what makes that portability possible at all, even if only the React renderer is used today.
4. **Testability.** A pure component can be snapshot-tested with fixed props and no mocked network. A component with an internal `fetch()` needs a mocked network layer just to render in a test — a likely contributor to the client's 6.5% test-coverage figure (`MAINTAINABILITY.md`): components that fetch internally are harder to test, so they don't get tested.
5. **Multi-surface reuse.** The same registry entry can render in the live storefront, the editor's preview pane, and collab sync simultaneously. A component fetching on its own gives each surface independent, possibly-inconsistent data that the editor can't intercept or mock — whereas a declared action can be.

#### Exception criteria — when host-level `fetch()` is correct, not a violation

A file is a legitimate **host-level exception** (not a catalog-registry violation) only if **all** of the following hold. If any one fails, it's a violation and should go through an action handler instead:

| Criterion | Check |
|---|---|
| **Not part of spec-addressed render output.** | The test is **not** "is this exact file itself a top-level registry key" — it's "does this file's output ever mount as part of the tree that renders when a spec places a catalog component, directly or transitively." `AdminNav.tsx` is not itself a registry key, but it's rendered inside `AdminShell`'s implementation, and `AdminShell` *is* a registry key — so placing `{"type": "AdminShell"}` in any spec transitively mounts `AdminNav` every time, with no opt-out. That makes it spec-addressed output and it fails this criterion. `main.tsx`, by contrast, is not rendered by anything a spec places — it's the file that *fetches* the spec and mounts the `Renderer` in the first place, so nothing a spec contains can ever cause it to render. |
| **Owns a surface's lifecycle, not a leaf's data.** | It's a route/page-level file (`main.tsx`), or a hook that produces the *initial* state/spec for a surface (analogous to a server loader) — not a widget deep in a rendered tree fetching its own slice of data. |
| **Single-renderer-target by nature.** | It's inherently React-DOM/browser-only (e.g. it drives routing or auth redirects) — it was never going to be portable to the PDF/email/video renderers anyway, so pure-component discipline buys nothing here. |
| **No catalog action already covers it.** | There isn't already a registered action that does the same fetch — if one exists, use it instead of adding a second, uncoordinated fetch path for the same data. |

**Important: failing criterion 1 does not mean "so register it as a catalog type."** For a bootstrap file like `main.tsx`, doing so would be circular — it exists to produce the spec, so it structurally cannot also be a node *inside* the spec it hasn't fetched yet. For a file like `AdminNav.tsx` that fails criterion 1 because it's nested inside spec-addressed output, the fix is not to register it as its own type either — it's to replace its internal `fetch()` with a catalog action + `$state`/props, matching how every sibling node in that same tree already gets its data.

Applying this to the current codebase: `main.tsx`'s `loadPage` passes all four (never spec-addressed, owns the whole app's bootstrap, browser-only, no existing action covers full-app bootstrap) — legitimate exception. `AdminNav.tsx` and `DocumentShareField.tsx` fail the first criterion (both mount as part of a catalog-addressed tree, whether or not they're themselves a registry key) — genuine violations, not exceptions, per `SPEC-DRIVEN-UI-COMPLIANCE.md`.

This directly resolves the confusion `SPEC-DRIVEN-UI-COMPLIANCE.md` flags between genuine violations (`AdminNav.tsx`, `DocumentShareField.tsx` — both catalog-registered) and the editor's `?edit=true` host-level bypass (a different kind of exception, addressed below).

### 2. New top-level section: "The persistence layer (CMS/documents) — not part of `@json-render`"

Insert after "Skeleton (catalog layers)", before "json-render patterns." Proposed content:

> ## The persistence layer (CMS/documents) — not part of `@json-render`
>
> **`@json-render` has no opinion on where a spec comes from.** Upstream's own examples either hardcode a spec in a file or generate one from an AI prompt on demand; there is no upstream concept of content types, entries, drafts, publishing, or references. Everything in this section is this platform's own layer, built on top of the rendering engine described in the rest of this skill — know that it's a deliberate addition, not something `@json-render` itself provides or documents, when you're extending it.
>
> ```
> templateFromPath(pathname)
>   → layout document (Postgres, via documents domain)
>   → GET /api/edge/schema (draft-aware, tenant-scoped)
>   → Spec { root, elements, state }
>   → <Renderer spec={…} registry={…} />
> ```
>
> | Concept | Where it lives | Not the same as |
> |---|---|---|
> | **Layout document** | `documents` domain, one JSON-tree-shaped row per template | A `Spec` object — a layout document *becomes* a `Spec` once resolved; it's not the wire format the renderer consumes directly |
> | **Content type / entry** | `documents` domain, schema-validated CMS rows | A catalog component prop schema — content types describe *data*, catalog schemas describe *UI* |
> | **Refs** | `@noname/documents` — how one document points at another (e.g. a page referencing a content entry) | A `$state` path — refs resolve server-side into plain values before they ever reach `$state` |
> | **Draft vs. published** | A flag on the layout/content document; the edge schema endpoint is draft-aware for authenticated editor sessions | Not a renderer concept — the renderer always gets one resolved `Spec`; draft/published is resolved before the renderer ever sees it |
>
> **When you're adding a new content type, admin panel, or domain, this is the layer where most of the "multi-touch-point" friction lives** (see `docs/2026-08-07/EXPANDABILITY.md` if available, or ask: does this change require touching `documents/ports.ts`, a seed script, `admin/registry.ts`, `platform-routes.ts`, and `auth/admin-routes.ts` all at once? If yes, that's this layer, not the rendering engine — budget for it accordingly and double-check every registry stays in sync, since nothing currently checks that automatically.)

### 3. Document the editor's `?edit=true` bypass as a named, deliberate exception — not a silent one

**Current state:** the skill's "stop and reject" list says hand-written React routes are disqualifying, but `main.tsx` lazy-loads `EditPageView` behind `?edit=true` with no spec/template resolution — and the skill never mentions this exists.

**Proposed addition**, in the "When to use this skill" section:

> **Named exception — visual editor (`?edit=true`).** The storefront visual editor does not resolve through `templateFromPath` + edge schema like every other org-facing surface — it lazy-loads a standalone `EditPageView` tree (`main.tsx`). This is a deliberate, approved exception: the editor's canvas/drag-drop/layer-tree UX is materially more complex than what the spec pipeline is designed for (compare to upstream's own reference "website builder," which is a raw JSON editor + live preview, not a canvas — see `JSON-RENDER-REFERENCE-PATTERNS.md` §5 if available). Treat editor-internal code as its own bespoke surface with its own test/perf bar — do not hold it to "must be spec-driven" the way admin panels and storefront pages are held to it, but also do not let editor code import from `admin/*` (see checklist below) — the exception is for *how the editor loads*, not for coupling it to unrelated layers.

### 4. Registry composition guidance — avoid `as never`, cite upstream's actual pattern

**Proposed addition**, in "Action wiring":

> **Registry composition — no type-erasure.** Upstream examples always compose a registry's `components`/`actions` maps as one typed object literal spread (`{ ...shadcnComponents, ...websiteComponents }`), never a cast. If your registry needs `as never` or `as any` to type-check, that's a signal your handler map's inferred type doesn't match what `defineRegistry` expects — usually because it was assembled from separately-typed partial maps merged together rather than declared as one literal against the catalog's action-params type. Fix the handler map's declaration, don't cast around the mismatch — a cast here silently disables the one compiler check that would catch a broken action handler signature.

### 5. Expanded "Validation before done" checklist

**Current** (end of skill):

```bash
pnpm typecheck
pnpm test          # if actions/schemas changed
# re-run layout/content seed if spec changed
```

Manual: load the org URL — page must render from edge schema, not a blank shell.

**Proposed replacement** — turn the existing "Violation checklist (for PR review)" (currently only in the separate `CLIENT-UI-ARCHITECTURE-AUDIT.md`, not in the skill itself) into a permanent part of this skill, and merge it with the validation section so there's one checklist, not two documents' worth scattered around:

```bash
pnpm typecheck
pnpm test          # if actions/schemas changed
# re-run layout/content seed if spec changed
```

**PR review checklist — spec-driven UI:**

```
- [ ] No new hand-written route pages for org UI (editor's ?edit=true is the one named exception — see above)
- [ ] No fetch() inside a component registered in admin/editor/platform registry — host/page/hook-level fetch is fine (see boundary above)
- [ ] Copy in props.labels or layout seed — not TSX literals
- [ ] New catalog components: catalogProps(config, labels) — no top-level flat props
- [ ] Mount load: MountAction or useMountAction — never [execute] in a useEffect dep array
- [ ] Editor code does not import admin/* (re-exports, types, or components)
- [ ] Registry composition uses typed object literals — no `as never`/`as any` at defineRegistry boundaries
- [ ] New editor strings: editorShellLabelsSchema + layout seed
- [ ] Interactive UI: keyboard path + aria where applicable
- [ ] New content type / admin panel: confirm every registry touched (admin/registry.ts, admin/schemas/*, platform-routes.ts, auth/admin-routes.ts) — nothing currently checks these stay in sync automatically
```

Manual: load the org URL — page must render from edge schema, not a blank shell.

*(Per your answer, this stays a written checklist for this pass — no automated lint/CI check is being added yet. If/when that's wanted, the two best starting candidates, per `ACTION-PLAN.md` items 22-23, are: a rule banning `fetch(` under `admin/**`/`editor/**` source, and a rule banning `editor/**` → `admin/**` imports.)*

---

## What does *not* change

- The `config`+`labels` prop contract, `props-contract.md`, `examples.md`, `reference.md` structure.
- `MountAction`/`useMountAction`, `useCatalogSubmit`, the three-layer action model (catalog schema → handler → registry).
- The "stop and reject" list for hand-written routes/pages tree — only gains one named, explained exception (the editor), not a loosening of the rule itself.
- Anything about extensions, content types, or layout templates already documented correctly.

---

## Full redlined skill text (for copy/paste when applying)

Below is the proposed full text of the sections that change, in final form, ready to paste into `skills/spec-driven-ui/SKILL.md` in place of the corresponding current sections. Sections not listed here (props-contract, examples, most of reference.md) are unchanged.

### Replace the "When to use this skill" section with:

```markdown
## When to use this skill

- Adding `/admin/*`, `/login`, or public-site UI
- Creating a new catalog component or action
- Seeding or publishing layout documents
- Registering a **content type** or content entries (CMS)
- Storefront visual editor (`?edit=true`)
- User asks for "admin page", "settings form", "CMS editor", or "new screen"

**Stop and reject** if the approach is: hand-written React route per screen, a `pages/` tree for org UI, or commerce-specific one-off admin forms.

**Named exception — visual editor (`?edit=true`).** The storefront visual editor does not resolve through `templateFromPath` + edge schema like every other org-facing surface — it lazy-loads a standalone `EditPageView` tree. This is deliberate: the editor's canvas/drag-drop/layer-tree UX is materially more complex than the spec pipeline is designed for. Treat editor-internal code as its own bespoke surface with its own test/perf bar; it does not need to itself be spec-driven the way admin panels and storefront pages do. The exception is for *how the editor loads* — editor code must still never import from `admin/*` (see PR checklist).
```

### Insert new subsection in `reference.md`, referenced from the fetch-rule row:

```markdown
## Host vs. catalog boundary

A component registered in any registry merged by `catalog-loader.ts` — `admin/registry.ts`, `editor/registry.ts`, `platform/registry.ts`, and every `packages/extensions/src/*/registry.ts` (and, once built, tenant-private/marketplace registries) — never calls `fetch` — it reads `props`/`$state` and emits actions. A host-level file (route page, a hook producing a surface's initial state) may fetch directly, the same way `@json-render/react`'s own hooks (`useUIStream`, `useChatUI`) and example apps do.

**Why:** catalog components are the AI/CMS safety boundary — a component the spec can place and fully describe via its schema. A component that fetches on its own has a side-channel the spec can't see or constrain. It also means loading/error/auth state is handled once centrally (`ActionProvider.execute`) instead of ad hoc per component, components stay portable across renderer targets (React/Vue/PDF/email/etc.), and components stay unit-testable without a mocked network layer.

**Exception criteria — all four required:**

1. Never mounts as part of spec-addressed render output — not just "is this file itself a registry key," but "does it render inside the tree a catalog component produces, even transitively" (e.g. `AdminNav` isn't a registry key but renders inside `AdminShell`, which is — so `AdminNav` still fails this criterion)
2. Owns a surface's lifecycle (route/page/bootstrap-level), not a leaf's data
3. Inherently single-renderer-target (browser-only concern like routing/auth redirect)
4. No existing catalog action already covers the same fetch

If any fails, route it through an action handler instead — failing criterion 1 is never resolved by registering the file as its own catalog type (for a bootstrap file that's circular; for a nested file, use an action + `$state` instead).
```

### Insert new section after "Skeleton (catalog layers)":

```markdown
## The persistence layer (CMS/documents) — not part of `@json-render`

**`@json-render` has no opinion on where a spec comes from.** Everything in this section is this platform's own layer on top of the rendering engine — know that it's a deliberate addition, not something the underlying library provides, when extending it.

\`\`\`
templateFromPath(pathname)
  → layout document (Postgres, via documents domain)
  → GET /api/edge/schema (draft-aware, tenant-scoped)
  → Spec { root, elements, state }
  → <Renderer spec={…} registry={…} />
\`\`\`

| Concept | Where it lives | Not the same as |
|---|---|---|
| **Layout document** | `documents` domain, one row per template | A `Spec` — becomes one once resolved, not the wire format itself |
| **Content type / entry** | `documents` domain, schema-validated CMS rows | A catalog component prop schema — describes data, not UI |
| **Refs** | `@noname/documents` | A `$state` path — refs resolve server-side before reaching `$state` |
| **Draft vs. published** | A flag on the document; edge schema is draft-aware for editor sessions | Not a renderer concept — the renderer always gets one resolved `Spec` |

Adding a content type, admin panel, or domain touches this layer, not the rendering engine — expect multiple registries/files to stay in sync by hand (nothing currently checks this automatically).
```

### Replace the fetch rule row in "What to call from components":

```markdown
| **Never** in a component registered in a catalog registry | `fetch("/api/…")` directly | Bypasses catalog validation; use action handler helpers. Does **not** apply to host-level files (route page, a data-owning hook) that load data from *outside* the spec tree — matches how `@json-render`'s own hooks (`useUIStream`, `useChatUI`) and example apps work. |
```

### Add to "Action wiring" section:

```markdown
### Registry composition — no type-erasure

Compose a registry's `components`/`actions` maps as one typed object literal (`{ ...setA, ...setB }`), never a cast. Needing `as never`/`as any` at a `defineRegistry` call means the handler map's declared type doesn't match its catalog — fix the declaration, don't cast around it; a cast disables the compiler check that catches a broken action signature.
```

### Replace "Validation before done" with the expanded checklist in §5 above.
