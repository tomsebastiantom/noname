# 04 — UI Spec Conformance Audit (`spec-driven-ui` skill)

**Question answered:** do all UI components actually follow the UI skill and props contract the project has written for itself?

**Rules tested** — from `skills/spec-driven-ui/SKILL.md`, `skills/spec-driven-ui/props-contract.md`, `skills/spec-driven-ui/reference.md`:

| Rule | Statement |
|---|---|
| **R1** | Flat props — one flat `z.object`; no `config`/`labels`/`catalogProps` buckets |
| **R2** | No user-visible copy in TSX — all strings from flat props or `$state` (host-shell loading/errors excepted) |
| **R3** | No `fetch()` in a component registered in a catalog registry — go through catalog actions |
| **R4** | Schema ↔ component ↔ registry ↔ seed stay in sync |
| **R5** | Mount loads use `MountAction`/`useMountAction`; never `[execute]` in a `useEffect` dep array |
| **R6** | No `as never`/`as any` at a `defineRegistry` boundary |
| **R7** | Registry composition uses typed object literals |

---

## Headline finding

**The codebase partially follows its UI skill.** The flat-props migration (R1) genuinely completed. The other six rules are partial, and **nothing enforces any of the seven** — 0/7 are covered by a lint rule, test, or CI gate.

| Pack | Components | R1 | R2 | R3 | R4 | R5 | R6/R7 |
|---|---:|---|---|---|---|---|---|
| Platform core | 10 | 100% | 100% | 100% | 100% | 100% | n/a |
| Admin | 24 | 96% | **50%** | 92% | 96% | 92% | ❌ |
| Editor (named exception) | 6 | 83% | 67% | exempt | 83% | ✅ | ❌ |
| Commerce extension | 11 | 100% | 82% | 82% | 100% | **73%** | n/a |
| **Total repo-owned** | **51** | ~96% | **~60%** | ~90% | ~94% | ~87% | **0%** |

Plus **36 external shadcn types** (`@json-render/shadcn@0.20.0`) and **7 orphan legacy types** (`client/src/catalog.ts`, unregistered).

---

## 1. Host / route conformance (the skill's Rule 1)

The skill's central rule: *every org-facing page loads from layout spec + catalog — not a hand-written React route.*

**Verdict: followed.** There is no react-router and no `pages/` tree. All org-facing surfaces resolve `URL → templateFromPath → layout document → GET /api/edge/schema → <Renderer>` (`platform-routes.ts:35-228` → `use-app-page-loader.ts:232` → `catalog-ui-shell.tsx:80`).

| Entry point | Spec-driven? | Classification |
|---|---|---|
| `ROUTE_TABLE` — 23 entries / 22 templates | Yes | Compliant |
| Storefront default | Yes | Compliant |
| `?edit=true` editor — `main.tsx:26,104-119` | No | **Named exception** (`SKILL.md:39`) |
| `/auth/callback` → `auth/callback-page.tsx` | No | Defensible (thin OAuth handler) |
| `admin-platform-view.tsx`, `editor-gate.tsx`, `admin-panel-prefetch.ts` | No | Host plumbing |
| `main.tsx:139` `<AuthBar>` | No | Host shell |

**One caveat that matters:** admin *chrome* is not renderer-driven. `platform/admin-platform-view.tsx:94` instantiates `<AdminShell props={shellProps as never}>` directly, and `platform/admin-layout.ts:8-12` reads only `rootEl.props` — so children, `visible`, and `$state` in the admin shell layout are **ignored**. The skill's claim is ~90% true in practice.

`ROUTE_TABLE` oddities: three overlapping `/admin` entries (`:169,170,172`); `/account` prefix falls back to template `admin_home` (`:178`); `/admin/settings/auth` maps to template `admin_dashboard` (`:110`); hardcoded legacy fallbacks at `:188-189`.

---

## 2. R1 — Flat props

**Verdict: the migration succeeded; ~96% conformant.**

- **Zero** live `props.config` / `props.labels` / `catalogProps` reads anywhere in the repo.
- All live component schemas are flat `z.object`.
- Residual `config`/`labels` vocabulary is naming-only and harmless: 25× `const labels = props;` aliases, spread label bundles (`admin/schemas/components.ts:16,32`), and `documents/src/catalog-props.ts:9-13` `specProps(config, labels)` which flattens via `{...config, ...labels}` before persisting.
- One dead branch remains: `editor/lib/schema-introspect.ts:142-155` `parseCatalogPropsSchema` still returns `{configShape, labelsShape}` with no schema producing either.

Nested copy records remain and are **not** violations under the contract, which explicitly permits keyed structures (`props-contract.md:82-93`): `LoginForm.views`/`providers`, `AdminShell.nav`/`settings`, `AdminHome.links`/`linksConfig`, admin `columns` buckets.

---

## 3. R2 — Copy owned by props (worst-performing rule, ~60%)

The skill is unambiguous (`SKILL.md:417`: "No user-visible text in React"; `props-contract.md:4`). Actual state: **≥70 literal user-visible strings across ~20 registry-reachable files**, plus ~13 inside the editor exception.

This is **per-panel drift, not a systemic design failure** — `AuthSettingsForm`, `FeatureFlagsAdmin`, `TracesAdmin`, and `LoginForm` are fully prop-driven.

Worst offenders:

| File:line | Literals |
|---|---|
| `admin/components/layout/LoginBrandingForm.tsx:80,92,93,98,108,118,128,137,148` | "Layout style", "Centered card", "Split (brand panel + form)", "Brand title", "Form title", "Logo URL", "Footer text" (+ placeholders `:103,113,143`) |
| `admin/components/team/UsersAdminForm.tsx:204,216,225,235` | "Email", "First name", "Last name", "Role" — all four have flat header props available |
| `admin/components/pages/PageTreeAdmin.tsx:101,105,114` | "URL slug → page document key", "Entry id", "Page document key" (a `pageKeyLabel` prop exists) |
| `admin/components/audiences/AudiencesAdmin.tsx:354,793,821` | "Select an audience", "No experience bindings yet.", "Binding" |
| `admin/components/auth-settings/apple-provider-section.tsx:46,56,65,74` | "Apple Services ID", "Apple Team ID", "Apple Key ID", "Apple Sign In private key (.p8)" |
| `components/rich-text/RichTextTipTapEditor.tsx:297-379,696` | toolbar labels + `title="Insert …"` + placeholder (reachable from `ContentEntryAdmin`) |
| `admin/components/shared/DocumentShareField.tsx:240` | "Select team member…" |
| `admin/components/integrations/CommsDeliveriesAdmin.tsx:216-218`; `IntegrationsLlmForm.tsx:90-91` | "queued/sent/failed"; "OpenAI"/"Anthropic" |
| `core/components/CommsInboxPanel.tsx:162,163` | `"read"` / `"unread"` |
| `packages/extensions/src/commerce/components.tsx:326,343`; `orders-admin.tsx:292,837`; `shared/RichTextRenderer.tsx:207` | "Cart unavailable", "Cart update failed", "Refund this order?", "Orders request failed", "Embedded asset" |

**A subtler R2 violation: copy baked into schemas as `.default()`.** When the spec omits the field the component renders code-owned copy, which is exactly what the contract forbids:

- `packages/extensions/src/commerce/catalog-schemas.ts:31-87` — ~45 user-visible label defaults for `OrdersAdmin` (largest single concentration in one file)
- `editor/schemas/components.ts:106-123,149` — ~9 editor shell label defaults
- `admin/schemas/components.ts:243-247` — 2 `AccountSecurityForm` defaults

**Also a skill-vocabulary violation** (`SKILL.md:14`: use *org*, not *merchant*): `WebhookSubscriptionsAdmin.tsx:321` `placeholder="https://merchant.example/hooks/noname"`.

---

## 4. R3 — No `fetch()` in registered catalog components

**Verdict: ~90% conformant, and the naive grep understates the problem.**

Raw `fetch(`/`axios`/`EventSource` appears in only 6 places, **all host-side** — legitimate: `lib/api.ts:89,109`, `use-app-page-loader.ts:64,232,344`, `admin-panel-prefetch.ts:40`. No raw `fetch` literal exists inside a registry-keyed file.

But the skill forbids something broader (`SKILL.md:313`: "Domain helpers — only action handlers (or server) may call them, not components"), and `reference.md` defines the boundary test as **transitive**. Under that test, these are violations:

| File:line | Call | Renders inside |
|---|---|---|
| `admin/components/team/AccountSecurityForm.tsx:261` | `startTotpEnrollment()` | registry key |
| `admin/components/agents/AgentsAdminForm.tsx:118,125` | `fetchAuthSessionStatus()`, `fetchScopeCollections()` in `useEffect(…,[])` | registry key |
| `admin/components/integrations/WebhookSubscriptionsAdmin.tsx:140,271,292` | retry/create/delete webhook subscription | registry key |
| `admin/components/integrations/CommsDeliveriesAdmin.tsx:70` | `retryCommsDelivery(id)` | registry key |
| `admin/components/team/ScopeAdminForm.tsx:66` | `fetchTeamMembers(...)` | registry key |
| `admin/components/team/UsersAdminForm.tsx:62` | `fetchAuthSessionStatus()` | registry key |
| `admin/components/shared/DocumentShareField.tsx:135` | `Promise.all([api.fetch(documentId), fetchTeamUsers()])` | **transitively** via `DocumentAccessFields.tsx:33-34` → `LayoutEntryAdmin.tsx:168`, `content-entry-editor.tsx:98` |
| `admin/components/shared/DocumentFolderField.tsx:28` | `fetchScopeCollections()` | same transitive path |
| `components/content/ReferenceFieldInput.tsx:110`, `MediaFieldInput.tsx:54,71` | list entries / get + upload asset | via `content-entry-field-input` → `ContentEntryAdmin` |
| `core/components/CommsInboxPanel.tsx:76` → `useCommsInboxStream.ts:23,29,33` | ticket fetch + `new EventSource(url)` | `AccountNotificationsInbox` **and** `CommsInboxAdmin` |
| `packages/extensions/src/commerce/orders-admin.tsx:141,153-155` | calls `commerceActions.loadOrdersAdmin(input)` from `useEffect` | `OrdersAdmin` |
| `packages/extensions/src/commerce/components.tsx:309` (CartSummary), `storefront-components.tsx:49` (CartDrawer) | `getCart()` (fetch at `cart.ts:146`) | registry keys |

**12 sites across 10 files.** `AdminNav.tsx:8` (`prefetchAdminPanel` on hover) is a gray case — no data lands in the component; the prior audit's AdminNav finding is fixed.

---

## 5. R4 — Registry / schema / seed sync (highest-value finding)

A new admin panel must touch **six** places, none cross-checked:

`admin/registry.ts:54-79` · `admin/schemas/components.ts:42-646` · `admin/schemas/actions.ts` · `platform-routes.ts:35-179` · `auth/admin-routes.ts:28-51` · seed specs/labels — plus `editor/lib/admin-palette-excluded.ts:2-22`.

The skill itself admits this (`SKILL.md:78`, `:464`: "nothing currently checks this automatically"). Confirmed drift:

1. **`TracesAdmin` is registered, routed, permissioned, and seeded — but has no props schema.** Registered `admin/registry.ts:24,78`; seeded `demo-specs.ts:565`; routed `platform-routes.ts:158-162`; permissioned `auth/admin-routes.ts:47`; **absent** from `admin/schemas/components.ts` (23 schemas vs 24 registry keys). Props are typed inline at `TracesAdmin.tsx:19`. `docs/FLAT_PROPS_MIGRATION.md:12` lists 21 schemas while `:17` lists 24 renderers including `TracesAdmin` — the omission is visible in the migration record itself. **`tsc --noEmit` still exits 0.**
2. **`/admin/settings/traces` is unreachable from navigation.** `demo-labels.ts:5-29` `adminShellNavConfig` has 15 items and no `traces`; `adminHomeLinkConfig:572-587` and `adminShellNavLabels:36-56` also omit it. A fully implemented panel has no link anywhere.
3. **`EditorSaveBar` is registered with no schema and no spec reference.** `editor/registry.ts:33` vs `editor/schemas/components.ts:188-213` (5 schemas, 6 keys). `SaveBar` is rendered directly by `VisualEditorShell.tsx:38`, so the registry key is inert.
4. **`ADMIN_PALETTE_EXCLUDED_TYPES` is stale by 5.** It lists 19 types (`admin-palette-excluded.ts:2-22`) against 24 registry keys. Missing: `CommsDeliveriesAdmin`, `CommsInboxAdmin`, `WebhookSubscriptionsAdmin`, `AudiencesAdmin`, `TracesAdmin` — meaning **those admin panels are draggable into storefront layouts** in the visual editor.
5. **Seed references a component the platform catalog never defines.** `demo-specs.ts:591-601` seeds `type: "OrdersAdmin"` for `/admin/orders`, but `OrdersAdmin` exists only in the commerce extension. If a tenant manifest omits `extensions: ["commerce"]` (`catalog-loader.ts:166`), the always-routed `admin_orders` template renders an unregistered root type.
6. **Seed ↔ reader desync:** `demo-specs.ts:53` passes `providers: ["google"]` (array) but `LoginForm.tsx:52,78` reads `providerList`. Because `specProps` spreads labels last (`documents/src/catalog-props.ts:13`), the label record overwrites the config array and `providerList` falls back to `[]` — it only works via server config. `docs/FLAT_PROPS_MIGRATION.md:18` claims this was fixed; only the renderer was changed.
7. **Route/registry desync:** `/admin/settings/security` (`platform-routes.ts:62-67`) carries `navId: "account_security"` but no `adminRouteId`; `adminNavItemVisible` returns `true` for unknown ids (`admin-routes.ts:127`), so it has **no permission rule**. Same for `adminHomeLinkConfig` ids `auth_providers` and `account_security`.
8. **`Pagination` (commerce) collides by name with shadcn's `Pagination`** — loader precedence decides the winner (`catalog-loader.ts:73-77`).

**Why nothing caught this — R6 is the mechanism.** `@json-render/react` types the maps as *exact* mapped types (`Components<C> = { [K in keyof InferCatalogComponents<C>]: ComponentFn<C,K> }`). Spread composition (`platform/registry.ts:10`) is exempt from excess-property checking, and `as never` (`platform/registry.ts:12`, `editor/registry.ts:44`) disables the action-signature check outright. So **registry↔catalog drift is type-invisible** — proven by `tsc --noEmit` exiting 0 with `TracesAdmin` schema-less.

---

## 6. R5 — Mount loads

The documented pattern is mostly followed: `useMountAction` (`core/components/MountAction.tsx:18-34`) is implemented correctly (execute on a ref, deps `[action, paramsKey]`) and used by 15 files; `MountAction` nodes appear 19× in the platform seed.

Violations — `execute` in a `useEffect` **dep array**, the exact infinite-loop hazard the skill names (`SKILL.md:236,324`):

| Location | Deps |
|---|---|
| `admin/components/agents/AgentsAdminForm.tsx:156` | `[execute, selectedTaskDetail?.status, selectedTaskId]` — with a 2 s `setInterval` calling `execute` at `:153` |
| `admin/components/audiences/AudiencesAdmin.tsx:184` | `[execute, selectedKey]` |
| `admin/components/audiences/AudiencesAdmin.tsx:216` | `[bindings, canViewAnalytics, execute, selectedKey]` |
| `admin/components/traces/TracesAdmin.tsx:121` | `[canViewTraces, execute, selectedTraceId]` — URL-dependent load, the skill's canonical `useMountAction` case |
| `packages/extensions/src/commerce/storefront-components.tsx:60-65` (CartDrawer) | raw `useEffect` load |
| `CollectionPage` / `SearchResults` | `useLoadListingOnMount` (`:316-328`) — ref-based execute, not `useMountAction` (⚠️ rather than ❌) |

Correctly *not* a violation: `core/use-catalog-submit.ts:40 [execute]` is a `useCallback` dep, not a mount load.

---

## 7. R6 / R7 — Registry typing

**0% conformant.** Both `defineRegistry` call sites cast:

- `platform/registry.ts:12` — `actions: coreActionHandlers as never,`
- `editor/registry.ts:44` — `actions: editorActionHandlers as never,`

Additional casts: `platform/admin-platform-view.tsx:94` (`props={shellProps as never}`), `admin/components/replay/ReplayPlayer.tsx:29` (third-party rrweb), `catalog-ui-shell.tsx:44` / `admin-platform-view.tsx:75` (`store.set.bind(store) as unknown as SetState`), `catalog.ts:39` (dead module), plus `as unknown as` churn in `editor/actions.ts:85,89`, `use-layout-draft.ts:42,82,110,145`, `collab/automerge-spec.ts:41,70,71,221,222`, `VisualEditorShell.tsx:247`.

Root cause identified: `core/actions/types.ts:9` declares `CatalogActionMap = Record<string, CatalogActionHandler>`, a blanket type that makes `satisfies` check nothing. **Skill rule R6/R7 is the rule whose violation hides every other violation.**

---

## 8. The editor exception

The skill grants the visual editor a named architectural exception (`SKILL.md:39`) with exactly two surviving obligations. Results:

| Obligation | Verdict |
|---|---|
| Editor code must never import `admin/*` | ✅ **Zero imports.** The 2026-08-07 finding is fixed — `editor/content-fields.ts:2-3` now points at `../components/content/*`. Remaining coupling is by *name* only (`editor/lib/admin-palette-excluded.ts:2-22` hand-lists admin types). |
| New strings via `editorShellLabelsSchema` + layout seed | ✅ schema exists (`editor/schemas/components.ts:174`), consumed by `VisualEditorShell.tsx:92`, seeded with 143 keys (`demo-specs.ts:144-318`). ❌ **broken by the agent subtree**: `AgentPanel.tsx:104-113`, `AgentSendIcon.tsx:13`, `AgentChatAvatar.tsx:5`, `CollabPeerIcons.tsx:13,32`, `AgentFailureDetails.tsx:28-68` — ~13 literals. |
| R1 flat props | ✅ 5/5 defined schemas flat (`EditorSaveBar` ungoverned) |

---

## 9. Orphans and dead code

- **Orphan parallel catalog, 375 lines, 0 importers:** `client/src/catalog.ts` (56 lines: `Hero`, `ProductCard`, `addToCart`/`checkout`), `component-schemas.ts` (78), `components/index.tsx` (161 — contains `"Add to Cart"` at `:62`). `component-schemas.ts:5,16` re-declares types that already exist in the commerce extension. It looks canonical and is dead; `ARCHITECTURE_DECISIONS.md:28` still names it as the catalog.
- 4 dead `@deprecated` re-export shims with zero importers.
- `editor/collab/ws-bytes.ts` — `sendAutomergeBytes` has 0 references.
- `Pressable` is named in `SKILL.md:118` but exists neither in the repo nor in `@json-render/shadcn@0.20.0` — a stale skill reference.

---

## 10. Enforcement gap — nothing checks R1–R7

**0 of 7 rules are enforced.**

- `biome.json:17-35` — recommended preset only; no custom/GritQL rule; `noExplicitAny: "off"` (`:26`) explicitly permits the R6 cast; no `noRestrictedImports` for the editor→admin boundary.
- `vitest.config.ts:7` — includes `packages/**/*.test.ts`, but **no test reads source files** (zero `readFileSync`/`readdirSync` in any test). All UI tests are behaviour-only: `commerce/catalog-schemas.test.ts`, `admin/login-branding.test.ts`, `editor/collab/automerge-spec.test.ts`, `server/.../normalize-layout-spec.test.ts`.
- **No CI.** So even these tests do not run automatically on a PR.

Consequence: `docs/2026-08-07/SKILL-REWRITE-PROPOSAL.md:17` predicted exactly this outcome ("no enforcement hooks"), and the same violations it named a week earlier in `docs/2026-08-01/CLIENT-UI-ARCHITECTURE-AUDIT.md:45` are **still present today**.

### The cheapest fix (one file, catches the top violations today)

A single `packages/client/src/catalog-conventions.test.ts` in the already-configured node environment:

1. **Registry ↔ schema key parity** per pack (`adminComponents` vs `adminComponentSchemas`; `editorComponentMap` vs `editorComponentSchemas`; core; commerce). → **catches `TracesAdmin` and `EditorSaveBar` immediately.**
2. **Transitive fetch ban** — walk registry-mapped impl files plus one import hop, regex `/fetch\(|api\.fetch\(|getCart\(|apiFetch/`. → catches `DocumentShareField`, `CartSummary`, `CartDrawer`, `CommsInboxPanel`, `OrdersAdmin`.
3. **Cast ban at registry boundary** — regex `as never|as any` in `**/registry.ts`. → catches both `defineRegistry` sites.
4. **Mount-load dep ban** — regex `\[[^\]]*\bexecute\b` inside a `useEffect` deps array. → catches the 4 admin sites.
5. **Flat-props regression guard** — regex `props\.(labels|config)\.` plus a check that no exported catalog schema has a `config`/`labels` `z.object` key.

Secondary, near-free: biome `noRestrictedImports` for `editor/** → admin/*`, and a `noRestrictedSyntax` rule for `as never`.

---

## 11. Top 10 UI violations, ranked

| # | Violation | Evidence | Rule |
|---|---|---|---|
| 1 | `TracesAdmin` registered + routed + seeded but schema-less; `tsc` exits 0 | `admin/registry.ts:78`, `demo-specs.ts:565` vs `admin/schemas/components.ts` | R4 + R6 |
| 2 | Components call fetching domain helpers (12 sites / 10 files) | `DocumentShareField.tsx:135`, `AccountSecurityForm.tsx:261`, `WebhookSubscriptionsAdmin.tsx:140,271,292`, … | R3 |
| 3 | Commerce `CartSummary`/`CartDrawer` call `getCart()` directly | `components.tsx:309`, `storefront-components.tsx:49` | R3 + R5 |
| 4 | `as never` at both `defineRegistry` boundaries — hides #1–#3 | `platform/registry.ts:12`, `editor/registry.ts:44` | R6 + R7 |
| 5 | `execute` in `useEffect` deps (infinite-loop class) | `AgentsAdminForm.tsx:156`, `AudiencesAdmin.tsx:184,216`, `TracesAdmin.tsx:121` | R5 |
| 6 | `EditorSaveBar` registered with no schema, never seeded | `editor/registry.ts:33` | R4 |
| 7 | ~45 label defaults baked into `commerce/catalog-schemas.ts:31-87` | same | R2 |
| 8 | ~70 hardcoded literals across ~20 registry-reachable files | `UsersAdminForm.tsx:204-235`, `LoginBrandingForm.tsx:80-148`, `PageTreeAdmin.tsx:101-114`, `RichTextTipTapEditor.tsx:297-379` | R2 |
| 9 | `ADMIN_PALETTE_EXCLUDED_TYPES` stale by 5 → admin panels draggable into storefront layouts | `admin-palette-excluded.ts:2-22` vs `admin/registry.ts:54-79` | R4 |
| 10 | Orphan 375-line duplicate catalog that looks canonical | `catalog.ts`, `component-schemas.ts`, `components/index.tsx:62` | R2 + R4 |

**Honourable mentions:** `/admin/settings/traces` unreachable from navigation and `account_security` has no permission rule (`admin-routes.ts:127`); seed↔reader `providers`/`providerList` desync (`demo-specs.ts:53`); MF shared `@json-render/*` declared `0.19.0` in `mf-init.ts:39-62` while the app runs `0.20.0`; `AdminHome.tsx:53-54` silent id fallbacks forbidden by `props-contract.md:177`.

---

## 12. Verdict

**"Is every UI component following the skill?" — No.**

- The **structural** part of the skill (spec-driven loading, flat props, action-mediated writes, the editor exception boundary) is genuinely respected. This is a real, working, coherent architecture, not a claim.
- The **discipline** part (copy ownership, fetch isolation, registry typing, schema/seed sync) is followed roughly 60% and enforced 0%.
- The failure is not that developers ignored the skill. The skill **predicted its own failure mode** (`SKILL.md:78`, `:464`) and shipped without the enforcement that would have prevented it. Every violation in §11 is mechanically detectable by a test that does not exist.
