# Flat Props Migration

Remove `catalogProps` split (`labels` + `config`). All props become flat (like shadcn `catalog.d.ts`).

## Status

### Schemas (converted — flat `z.object` only)
- `core/catalog-schemas.ts`: Grid, Stack, Text, Button, Image, LoginForm, AuthLayout, MountAction, AccountNotificationsInbox, AccountNotificationPrefsForm (all 10)
- `editor/schemas/components.ts`: VisualEditorShell + 4 editor chrome (all 5)
- `admin/schemas/components.ts`: AdminCollapsibleSection, AdminShell, AuthSettingsForm, IntegrationsCommsForm, CommsDeliveriesAdmin, CommsInboxAdmin, WebhookSubscriptionsAdmin, IntegrationsLlmForm, IntegrationsOAuthForm, LoginBrandingForm, AccountSecurityForm, UsersAdminForm, AgentsAdminForm, ScopeAdminForm, FeatureFlagsAdmin, AnalyticsEventsAdmin, SessionReplayAdmin, ContentEntryAdmin, LayoutEntryAdmin, AdminHome, PageTreeAdmin, PageEntryAdmin (all 21)
- `component-schemas.ts`: base Hero, ProductCard, Grid, Stack, Text, Button, Image (flat already)
- `packages/extensions/src/commerce/catalog-schemas.ts`: Hero, ProductCard — converted to flat (was still `catalogProps` split)

### Renderers (converted — read flat props)
Admin (24): AdminCollapsibleSection, AdminShell (+ TDZ fix on `activeNav`), AuthSettingsForm, IntegrationsCommsForm, CommsDeliveriesAdmin, CommsInboxAdmin, WebhookSubscriptionsAdmin, IntegrationsLlmForm, IntegrationsOAuthForm, LoginBrandingForm, AccountSecurityForm, UsersAdminForm, AgentsAdminForm, ScopeAdminForm, FeatureFlagsAdmin, AnalyticsEventsAdmin, SessionReplayAdmin, ContentEntryAdmin, LayoutEntryAdmin, AdminHome (`links` + `linksConfig` flat), PageTreeAdmin, PageEntryAdmin, TracesAdmin.
Core (2 + cleanup): AccountNotificationsInbox, AccountNotificationPrefsForm; removed unused `CatalogProps` imports and dead `*Config`/`*Labels` types in LoginForm/AuthLayout; fixed LoginForm `providerList` usage (was reading the label `providers` record as the config array).
Editor: VisualEditorShell (parses flat props), EditorPalette/LayerTree/Canvas/PropsPanel slot shells unchanged.
Extensions: `commerce/components.tsx` Hero/ProductCard — flat props.

### Systemic changes (done)
- `editor/lib/schema-introspect.ts`: `parseCatalogPropsSchema` returns flat root for both buckets; `fieldsFromZodShape` emits **flat field paths** (`key`, not `config.key`/`labels.key`).
- `editor/lib/edit-metadata.ts`: `defaultProps` is now a single flat merged object; fields built once.
- `editor/lib/spec-utils.ts`: `patchBlockProps` flat; `mergeContentDraftIntoPreview`/`mergePendingAddIntoPreview`/`addComponentToSpec` write/read flat props.
- `editor/lib/types.ts`: `EditComponentMeta.defaultProps` + `PendingBlockAdd.props` are `Record<string, unknown>` (flat).
- `editor/lib/field-filter.ts`: hidden path `config.params` → `params`.
- `editor/components/panel/PropsPanel.tsx`: `cmsStateKey` reads `$state` from the bound value (path-format independent).
- `editor/hooks/editor-session.tsx`: `mergeShellRuntimeConfig` merges `templateName`/`pageContentRef` flat.
- `editor/hooks/use-editor-shell-labels.ts`: `parseShellFromSpec` parses the whole flat `shell.props`.
- `editor/hooks/use-edit-page-orchestration.ts`: `stageAdd` uses flat defaultProps; `labelsMissingMessage` reads flat `labelsMissingHint`.
- `editor/hooks/use-editor-history.ts`: pending-add snapshot clones flat props.
- `editor/components/canvas/drop-utils.ts`: Stack direction read flat.
- `admin/login-branding.ts`: reads/writes flat AuthLayout/LoginForm props.
- `platform/admin-layout.ts`: `panelChromeFromSpec`/`mergeAdminShellWithPanelChrome` read/write flat title/description.
- `platform/admin-platform-view.tsx` + `main.tsx`: `AdminShellProps` is `Record<string, unknown>`.
- `packages/server/.../normalize-layout-spec.ts`: Text copy stays at `props.content` (only maps LLM `text` → `content`); prompts in `patch-layout-draft.ts` / `orchestrate-system.ts` updated to `props.content`.
- Split helpers removed: `catalogProps` + `CatalogProps` removed from `packages/documents`; re-exports dropped from `schemas/shared.ts` and `packages/extensions/src/catalog-props.ts` (file deleted).

### Seeds / demo (done)
- `scripts/seed/demo-specs.ts`: all props via flat `specProps`; AdminHome label record renamed to `linksConfig` (matches schema — `links` is the array).
- `scripts/seed/demo-commerce.ts`: flat props; edge-schema assertion reads `props.title`/`props.price` (was `props.config.*`).
- `scripts/seed/demo-labels.ts`: unchanged (pure label bundles).

### Tests (updated)
- `admin/login-branding.test.ts` — flat spec fixture + assertions.
- `editor/collab/automerge-spec.test.ts` — flat Text props round-trip.
- `server/.../normalize-layout-spec.test.ts` — content stays top-level; `text` → `content` mapping.

### Skill docs (updated — flat props only)
- `skills/spec-driven-ui/props-contract.md` — rewritten for flat props; `catalogProps`/split removed.
- `skills/spec-driven-ui/SKILL.md`, `reference.md`, `examples.md`, `skills/README.md` — split references replaced with flat-only guidance.

## Verification
- `pnpm --filter @noname/client typecheck`: only the 10 pre-existing json-render 0.19.0/0.20.0 dependency-version errors remain (catalog-loader.ts, catalog.ts, registry.ts — unrelated to this migration; same as baseline).
- `pnpm --filter @noname/documents`, `@noname/extensions`, `@noname/server` typecheck: clean.
- `pnpm vitest run`: 121 files / 433 tests pass.

## Rule
Always use flat props (`z.object` or `{ ...merged }`). Never `catalogProps` split (`labels`/`config`). `props.labels`/`props.config` are removed — read everything from the top-level props.
