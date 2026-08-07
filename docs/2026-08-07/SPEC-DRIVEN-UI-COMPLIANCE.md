# Spec-driven UI compliance

> **Baseline:** [`skills/spec-driven-ui/SKILL.md`](../../skills/spec-driven-ui/SKILL.md) — the team's own stated architecture vision: *"Every org-facing page loads from layout spec + catalog — not a hand-written React route,"* components never call `fetch` directly (only action handlers do), all copy lives in `props.labels`/CMS, and mount loads use `MountAction`/`useMountAction`, never `useEffect(..., [execute])`.
>
> This file checks `packages/client` against that stated vision specifically — it's narrower than [`ARCHITECTURE.md`](./ARCHITECTURE.md) (which covers general code structure) and re-verifies (rather than assumes) the findings in the prior [`docs/2026-08-01/CLIENT-UI-ARCHITECTURE-AUDIT.md`](../2026-08-01/CLIENT-UI-ARCHITECTURE-AUDIT.md), which covered the same ground about a week ago. Verified against source on 2026-08-07; the violations below still exist at the same locations that audit found.

---

## Verdict

**Partially compliant, with the violations concentrated in exactly the places the skill calls out as the two hardest cases: the visual editor and mount-time data loading.** The core primitives the skill describes — `defineRegistry`, `JSONUIProvider`, `MountAction`/`useMountAction`, `useCatalogSubmit`, `config`+`labels` props — are real, implemented, and used correctly by the majority of admin panels. But there is no automated enforcement of any rule in the skill (no lint rule catches `fetch()` in a component, no test catches a hardcoded label), so compliance drifts wherever a panel was written under time pressure, and it has drifted in specific, identifiable places.

---

## Rule-by-rule check

### Rule: "Every org-facing page loads from layout spec + catalog — not a hand-written React route" (HIGH violation)

**Violated at the host level, by design, for the editor:**

```222:222:packages/client/src/main.tsx
const editQuery = editMode && !platformRoute ? "&edit=true" : "";
```

```63:63:packages/client/src/main.tsx
const EditPageView = lazy(() => import("./editor").then((m) => ({ default: m.EditPageView })));
```

`?edit=true` lazy-loads a standalone `EditPageView` React component tree instead of resolving to a layout template through `platformTemplateFromPath` + `GET /api/edge/schema` like every other org-facing surface. This is the single largest architectural exception to the skill's core rule, and it's not a small one — the entire visual editor runs outside the spec pipeline the skill mandates.

The skill's own "stop and reject" list explicitly names *"hand-written React route per screen"* as disqualifying. The editor predates or was built around this rule rather than through it. This may be a legitimate, deliberate exception (an editor plausibly needs more imperative control than a storefront page), but it should be a **documented** exception in the skill itself, not a silent one — right now a new contributor reading the skill would not learn that this carve-out exists or why.

### Rule: "Components call `execute`, never `fetch` directly" (MEDIUM-HIGH violation)

The skill is explicit and repeated on this point (`SKILL.md` lines 130, 282, 337: *"Never in components: `fetch(\"/api/…\")` directly — bypasses catalog validation."*)

Confirmed current violations (fetch calls inside component/admin files, not inside `lib/api.ts` or the designated auth-helper modules):

| File | Pattern |
|---|---|
| `admin/components/shell/AdminNav.tsx` | Direct `fetch(` call in a shell/nav component |
| `admin/components/shared/DocumentShareField.tsx` | Direct `fetch(` call in a shared form field |
| `core/actions/auth.ts` | Borderline — this is an *actions* module, which is the correct layer per the skill, but it's worth confirming it isn't also reachable/called as if it were a component helper |

Also still present from the prior audit and reconfirmed: `admin/components/team/AccountSecurityForm.tsx` calls `fetchAuthSessionStatus`/`startTotpEnrollment` directly rather than through a catalog action, and `core/components/LoginForm.tsx` fetches auth-provider config in a `useEffect` on mount.

### Rule: "Mount loads use `MountAction`/`useMountAction`, never `useEffect(..., [execute])`" (MEDIUM violation)

10 admin component files use `useEffect` for what look like mount-time loads (`AgentsAdminForm.tsx`, `ScopeAdminForm.tsx`, `UsersAdminForm.tsx`, `TracesAdmin.tsx`, `DocumentShareField.tsx`, `ReferenceFieldInput.tsx`, `AccountSecurityForm.tsx`, `MediaFieldInput.tsx`, and others). Not every `useEffect` in this list is necessarily a mount-load violation — some may be legitimate DOM-effect or subscription code — but the skill's own reference audit (`CLIENT-UI-ARCHITECTURE-AUDIT.md`) already named several of these specifically as bypasses, and they haven't moved since:

- `AgentsAdminForm.tsx` — 4 `useEffect`s doing session fetch + polling
- `ReferenceFieldInput.tsx`, `MediaFieldInput.tsx` — fetch on mount instead of `MountAction`
- `use-layout-draft.ts`, `use-content-draft.ts`, `use-editor-prefs.tsx` (editor layer) — mount/save via admin API re-exports, not `execute`

### Rule: "Editor action handlers are wired, not stubbed" (HIGH violation, and a genuine type-safety hole)

```42:42:packages/client/src/editor/registry.ts
actions: editorActionHandlers as never,
```

The skill's three-layer action model (catalog schema → handler → registry) requires the handler map to actually satisfy the schema's action-params contract. `as never` doesn't wire that contract — it disables the compiler check that would tell you if it's missing. Same pattern in `platform/registry.ts:10` and a props-level version in `platform/admin-platform-view.tsx:85`. This is the same finding flagged in `MAINTAINABILITY.md`'s typing-discipline section, but it's worth calling out here specifically because it's not just a type-safety nit — it's the mechanism by which "editor actions are unimplemented" (the skill's core action-wiring rule) becomes possible to ship without a compiler error.

### Rule: "All copy in `props.labels` — no hardcoded TSX strings" (MEDIUM violation, widespread but low individual severity)

Confirmed still present in the same areas the prior audit found: `PageEntryAdmin`/`LayoutEntryAdmin` table headers and empty states, `AccountSecurityForm` MFA copy, `ReferenceFieldInput`/`content-entry-type-list`/`content-entry-create-form` widget copy, and Zod schema defaults in `login-branding.ts`/`login-form-labels.ts` used as fallback English text. None of these break functionality, but they block localization and mean the "no user-visible text in React" rule has no teeth — there's no lint rule or test that would catch a new violation being added today.

### Rule: "Editor code does not import `admin/*`" (HIGH violation, structural)

```1:3:packages/client/src/editor/content-fields.ts
export { ContentEntryFieldInput } from "../admin/components/content/content-entry-field-input";
export { MediaFieldInput } from "../admin/components/content/MediaFieldInput";
```

The skill's own PR-review checklist (bottom of the 2026-08-01 audit, still the right check to run) says explicitly: *"Editor code does not import admin/*."* This is violated at minimum in `editor/content-fields.ts`, `editor/content-entries.ts`, `editor/layout-entries.ts`, `editor/lib/editor-overrides.ts`, and `RichTextTipTapEditor.tsx` (imports a type from `admin/components/content/MediaFieldInput`). See `ARCHITECTURE.md` for the full list — repeated here because it's specifically a violation of a rule the skill states, not just a general coupling smell.

---

## What's genuinely compliant (verified, not assumed)

- **`config` + `labels` prop contract** — Zod schemas in `admin/schemas/components.ts` consistently use `catalogProps(config, labels)`; this is the one rule with the best adherence across the codebase.
- **`useMountAction` / `MountAction`** exist and are used correctly by the majority of admin panels (`AuthSettingsForm`, `ContentEntryAdmin`, `LayoutEntryAdmin`, `UsersAdminForm`) — these are legitimate reference implementations a new contributor can copy.
- **`useCatalogSubmit`** for editable-draft save flows is used in 20 files with the `loadedAt`/`key` pattern the skill describes — this pattern is followed more consistently than any other part of the skill.
- **The runtime shell** (`CatalogUiShell`, `JSONUIProvider` with synchronous `handlers()`, not `registerHandler` in `useEffect`) matches the skill's action-wiring section exactly.
- **No react-router / no `pages/` tree for org UI** — routing is template-based as the skill requires, even though the *implementation* of that routing has its own problems (see `ARCHITECTURE.md`'s triple-registry-drift finding, which is a maintainability issue, not a spec-driven-UI violation per se).

---

## Why this keeps drifting: no enforcement, not lack of a plan

Every violation above exists in a codebase that has a clear, well-written skill document stating the opposite rule, plus a prior audit (`CLIENT-UI-ARCHITECTURE-AUDIT.md`, 2026-08-01) that already named most of these exact files. A week later, they're all still there. That's not a sign the plan is wrong — it's a sign that a markdown skill file, read by an agent or developer at the *start* of a task, has no way to catch a violation introduced mid-task. Concretely:

- No lint rule flags `fetch(` inside `src/admin/components/**` or `src/editor/**`.
- No lint rule flags a relative import from `editor/**` into `admin/**`.
- No test asserts that layout-seed labels cover every panel's rendered strings.
- `as never` at the registry boundary actively defeats the one mechanism (TypeScript) that could have caught the action-wiring gap automatically.

## Recommendation

Treat this the same as the rest of this audit's expandability findings: the design is right, the enforcement is missing. Concretely, add to [`ACTION-PLAN.md`](./ACTION-PLAN.md):

1. A Biome/custom lint rule banning `fetch(` under `src/admin/**` and `src/editor/**` (allow-list `lib/api.ts` and the auth module) — turns rule violations into CI failures instead of audit findings.
2. A lint rule (or a simple import-graph script in CI) banning `editor/**` → `admin/**` imports.
3. Fix the two `as never` casts in `platform/registry.ts` and `editor/registry.ts` by making the handler maps actually satisfy their schemas — this is the highest-leverage single fix since it turns on a compiler check that covers future action additions too, not just today's gap.
4. ~~Either formally document the `?edit=true` editor bypass...~~ **Done** — see re-verification below.

---

## Re-verification against the finalized skill (2026-08-07)

[`SKILL-REWRITE-PROPOSAL.md`](./SKILL-REWRITE-PROPOSAL.md) has been applied to `skills/spec-driven-ui/SKILL.md`/`reference.md`, including the narrowed fetch rule and its four-criteria host-vs-catalog boundary test. Re-checked every file named above against that test — **none reclassify as legitimate exceptions**; the new wording only makes explicit *why* they're violations:

| File | Criterion 1 result | How |
|---|---|---|
| `AccountSecurityForm.tsx` | Fails directly | Is itself a key in `admin/registry.ts`'s `adminComponents` map |
| `AgentsAdminForm.tsx` | Fails directly | Is itself a key in `admin/registry.ts`'s `adminComponents` map |
| `LoginForm.tsx` | Fails directly | Is itself a key in `core/components.tsx`'s `coreComponents` map |
| `AdminNav.tsx` | Fails transitively | Rendered inside `AdminShell` (`AdminShell.tsx:47`), which is a registry key |
| `ReferenceFieldInput.tsx`, `MediaFieldInput.tsx` | Fail transitively | Rendered via `content-entry-field-input.tsx`, mounted inside `ContentEntryAdmin` (a registry key) |
| `DocumentShareField.tsx` | Fails transitively | Rendered via `DocumentAccessFields.tsx`, mounted inside `LayoutEntryAdmin` (a registry key) |

Only `main.tsx`'s editor bootstrap (`loadPage`, the `?edit=true` lazy-load) passes all four criteria — it's the one legitimate exception, and it's now named and explained directly in `SKILL.md`'s "When to use this skill" section, closing recommendation #4 above.

**Practical effect:** items 1–3 above (and `ACTION-PLAN.md` items 22–23, 25) proceed exactly as originally scoped — fix `AgentsAdminForm.tsx`, `ReferenceFieldInput.tsx`, `MediaFieldInput.tsx`, `AccountSecurityForm.tsx` by wiring them onto `MountAction`/catalog actions, no file gets a pass.
