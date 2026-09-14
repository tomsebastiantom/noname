# Audit of `docs/2026-07-25` Against Current Repository

**Audit date:** 2026-09-14  
**Scope:** Every Markdown file under `docs/2026-07-25` (and no other assigned documents).  
**Repository evidence reviewed:** current `packages/{auth,client,documents,extensions,fixtures,seeding,server,verticals,workers}`, package manifests, current 2026-09-14 roadmap, and recent history through `d983a9d` (including editor/collaboration, authorization, commerce, seeding, and fixture changes).  
**Decision meanings:** *current* = status and implementation references remain materially accurate; *historical* = deliberately retained record of an earlier state; *design-reference* = useful proposed architecture, not a status claim; *stale-needs-correction* = contains materially false status, ownership, paths, or “next” claims; *unclear* = evidence is insufficient or contradictory.

## Summary

All 33 assigned documents were read. None should be treated as an authoritative current roadmap. `ROADMAP-PHASES.md` is explicitly historical. The tenant Git/security and permissions OSS documents are primarily design references. The remaining status/implementation documents require correction because the repository progressed substantially after 2026-07-25: the visual editor and collaboration are live, authorization uses ZITADEL plus Keto-backed scope, Commerce moved into `packages/verticals` and the Commerce extension, and seeding moved into `packages/seeding` with neutral fixtures in `packages/fixtures`. The current planning authority is `docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md`.

## `docs/2026-07-25/ACCOUNT-FLOWS.md`

**Classification:** stale-needs-correction.  
**Factual implementation status:** Password reset, registration, MFA login/TOTP enrollment, and account-security flows remain implemented in the auth service and client. The document’s high-level feature table is substantially true, but its 2026-07-25 “implemented” snapshot omits later route/adapter restructuring and current authorization/session behavior.  
**Evidence:** `packages/server/src/domains/auth/service.ts`; `packages/server/src/domains/auth/routes/login.ts`; `packages/server/src/domains/auth/routes/mfa.ts`; `packages/server/src/domains/auth/adapters/zitadel/users.ts`; `packages/server/src/domains/auth/adapters/zitadel/mfa.ts`; `packages/client/src/core/components/LoginForm.tsx`; `packages/client/src/auth`; `packages/server/src/domains/auth/account-flows.test.ts`.  
**Stale claims:** Listed implementation paths (`domains/auth/api.ts`, `zitadel-client.ts`, `zitadel-users.ts`, `zitadel-mfa.ts`, client `account-flows.ts`) no longer match the current route/adapter layout; the document does not describe current ZITADEL authorization and current admin-security routes.  
**Disposition:** Correct paths and current route/guard evidence; leave the feature-status sections after re-verification.

## `docs/2026-07-25/ADMIN-UI-LATER.md`

**Classification:** stale-needs-correction.  
**Factual implementation status:** Admin shell, CMS, layouts, pages, auth settings, users/security surfaces, and editor foundations exist; the visual editor is no longer “not built yet” or merely a `PropsPanel` foundation. Current editor/collaboration code is extensive and live-smoke status is recorded by the authoritative roadmap.  
**Evidence:** `packages/client/src/admin`; `packages/client/src/platform/use-app-page-loader.ts`; `packages/client/src/editor/`; `packages/client/src/platform-routes.ts`; `docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md`; commits `05f7434`, `68a182b`, `bd4128f`, `04a5da7`.  
**Stale claims:** “Visual editor … not built yet,” Phase 9 as pending, old `VISUAL_EDITOR.md`/component paths, and old seed command/layout assumptions.  
**Disposition:** Correct status, routes, component locations, and validation commands; retain the admin architecture as reference.

## `docs/2026-07-25/ARCHITECTURE-MAP.md`

**Classification:** stale-needs-correction.  
**Factual implementation status:** Useful index and conceptual split, but its build-order/status map is superseded. Current platform includes visual editor, collaboration, flags, notifications, analytics, evidence, seeding, and fixtures; Commerce is split between `packages/verticals` and `packages/extensions`.  
**Evidence:** `docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md`; `packages/verticals/src/commerce`; `packages/extensions/src/commerce`; `packages/client/src/editor`; `packages/server/src/domains/collab`; `packages/seeding`; `packages/fixtures`; git history after 2026-07-25.  
**Stale claims:** D/visual editor is still pending; tenant-MF and older phase ordering are presented as the next build; index points to obsolete/non-authoritative status narratives and old paths.  
**Disposition:** Correct as an index and point status/build order to the 2026-09-14 authoritative roadmap.

## `docs/2026-07-25/AUTH-IDENTITY.md`

**Classification:** stale-needs-correction.  
**Factual implementation status:** ZITADEL remains identity authority; tenant resolution, JWT/HMAC edge handling, embedded login, and org-scoped persistence remain implemented. Team authorization and later platform infrastructure have evolved beyond this snapshot.  
**Evidence:** `packages/server/src/domains/auth`; `packages/workers/src/auth.ts`; `packages/workers/src/routes/resolve-proxy-org.ts`; `packages/workers/src/resolve-slug.ts`; `packages/server/src/domains/auth/adapters/zitadel/authorizations.ts`; `packages/server/src/domains/auth/adapters/keto`; `packages/server/src/domains/documents`; `packages/workers/src/routes/*.test.ts`.  
**Stale claims:** Old exact file names, old phase table, and “custom domains later” status are incomplete; current authorization is not just the described HMAC/team-role snapshot.  
**Disposition:** Correct implementation map and status table; preserve the identity principles.

## `docs/2026-07-25/CLIENT-ACTIONS.md`

**Classification:** stale-needs-correction.  
**Factual implementation status:** The action/catalog principle remains valid and extension registries exist. Current code has more layered editor/platform/Commerce behavior than the proposed 2025-style split, while tenant remote handling is implemented in server tenant bundling rather than only a target architecture.  
**Evidence:** `packages/client/src/platform/registry.ts`; `packages/client/src/core/actions`; `packages/extensions/src/commerce/registry.ts`; `packages/client/src/catalog-loader.ts`; `packages/client/src/editor/actions.ts`; `packages/server/src/domains/tenant/adapters/bundler.ts`.  
**Stale claims:** Checklist still marks remote action merging as future and says registry files “today (to split)” although the repository has since refactored platform/editor/extension ownership.  
**Disposition:** Correct the current action ownership and completion checklist; retain the canonical side-effect rule.

## `docs/2026-07-25/CLIENT-CATALOG-LAYERS.md`

**Classification:** stale-needs-correction.  
**Factual implementation status:** Core plus enabled extension catalogs remain the model, and Commerce extension code exists. Current repository also has editor catalogs, vertical ownership, lifecycle wiring, and tenant build routes.  
**Evidence:** `packages/client/src/catalog-loader.ts`; `packages/client/src/platform/registry.ts`; `packages/extensions/src/index.ts`; `packages/extensions/src/commerce`; `packages/extensions/src/commerce/lifecycle.ts`; `packages/verticals/src/commerce`; `packages/server/src/domains/tenant`.  
**Stale claims:** “Implemented” is too broad for the listed MF/runtime guarantees; code-layout and seed details are from the old package organization; it omits current Commerce vertical separation.  
**Disposition:** Correct package map and distinguish implemented platform/extension behavior from optional tenant remotes.

## `docs/2026-07-25/CONTENT-RENDER-PIPELINE.md`

**Classification:** stale-needs-correction.  
**Factual implementation status:** Edge URL/page resolution and CMS-to-layout rendering exist; `$state` resolution remains implemented. The document’s general pipeline is useful, but the checklist and file references are obsolete.  
**Evidence:** `packages/server/src/domains/edge/resolve-spec.ts`; `packages/server/src/domains/edge`; `packages/server/src/domains/documents/services/pages.service.ts`; `packages/server/src/domains/documents/merge.ts`; `packages/client/src/platform/use-app-page-loader.ts`; related tests.  
**Stale claims:** “Backend (to build — Step 1)” is marked partly future although implemented; old `domains/edge/service.ts` and `domains/documents/service.ts` references are not the current decomposition; page-document contentRef work is described as optional/unfinished without current evidence.  
**Disposition:** Correct checklist and implementation paths; leave the conceptual resolved-spec model.

## `docs/2026-07-25/DOCUMENT-REFS.md`

**Classification:** stale-needs-correction.  
**Factual implementation status:** Canonical document-id refs, parsing/legacy compatibility, inbound-ref scans, resolve behavior, and admin use remain present.  
**Evidence:** `packages/server/src/domains/documents/refs`; `packages/server/src/domains/documents/routes/refs.ts`; `packages/server/src/domains/documents/services/content-write.ts`; `packages/client/src/editor/content-ref.ts`; `packages/client/src/admin`; `packages/server/src/domains/documents/refs/*.test.ts`.  
**Stale claims:** Old flat paths (`refs.ts`, `find-inbound-refs.ts`, `resolve-refs.ts` at domain root) and old `ContentEntryAdmin` locations; current document write guards/scope and editor integration are omitted.  
**Disposition:** Correct evidence paths and add current authorization/editor behavior; retain `{ documentId }` decision.

## `docs/2026-07-25/EMBEDDED-LOGIN.md`

**Classification:** stale-needs-correction.  
**Factual implementation status:** Server-brokered login remains current and is implemented through ZITADEL adapters/routes.  
**Evidence:** `packages/server/src/domains/auth/routes/login.ts`; `packages/server/src/domains/auth/adapters/zitadel/client.ts`; `packages/client/src/core/actions/auth.ts`; `packages/client/src/auth`; `packages/workers/src/routes/public-routes.ts`.  
**Stale claims:** Old `packages/server/src/domains/auth/zitadel-client.ts`, `auth/api.ts`, and client paths; dev setup and “Phase A2 target/scaffold” wording are outdated.  
**Disposition:** Correct paths and current security/route behavior; leave the broker decision.

## `docs/2026-07-25/EXTENSION-LIFECYCLE.md`

**Classification:** stale-needs-correction.  
**Factual implementation status:** Manifest/catalog/component/action/machine concepts remain, but Commerce lifecycle and server capability ownership have materially expanded.  
**Evidence:** `packages/extensions/src/commerce/lifecycle.ts`; `packages/extensions/src/commerce/registry.ts`; `packages/verticals/src/commerce`; `packages/server/src/domains/machines`; `packages/server/src/domains/tenant`; `docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md`.  
**Stale claims:** Machine registration is described as seed-only/target while current generic machine, capability, checkout, evidence, and lifecycle paths exist; old extension file contract and Commerce examples omit vertical split.  
**Disposition:** Correct lifecycle/status tables and ownership; retain bundle model as design reference.

## `docs/2026-07-25/EXTENSIONS.md`

**Classification:** stale-needs-correction.  
**Factual implementation status:** “Extension” remains the code/API naming convention and Commerce extension exists.  
**Evidence:** `packages/extensions/package.json`; `packages/extensions/src/index.ts`; `packages/extensions/src/commerce`; `packages/verticals/src/commerce`; `packages/server/src/domains/machines`.  
**Stale claims:** Server half is described as generic machines only and machine registration as future; current Commerce behavior is deliberately vertical-owned and the document omits that boundary.  
**Disposition:** Correct current ownership and lifecycle claims; preserve terminology decision.

## `docs/2026-07-25/LOGIN-UI.md`

**Classification:** stale-needs-correction.  
**Factual implementation status:** LoginForm, social providers, per-org configuration, account flows, and action-based auth remain implemented.  
**Evidence:** `packages/client/src/core/components/LoginForm.tsx`; `SocialLoginButtons.tsx`; `packages/client/src/core/actions/auth.ts`; `packages/server/src/domains/auth/routes`; `packages/server/src/domains/auth/service.ts`; auth tests.  
**Stale claims:** “Phase” status and old paths are not current; runtime loading now goes through the refactored platform page loader and current auth routes.  
**Disposition:** Correct implementation map and remove obsolete scaffold/future wording.

## `docs/2026-07-25/ORG-AUTH-CONFIG.md`

**Classification:** stale-needs-correction.  
**Factual implementation status:** Per-org public auth config, provider publication, ZITADEL IdP management, password/reset/sign-up flags, MFA status, and team authorization are implemented for current scope.  
**Evidence:** `packages/server/src/domains/auth/service.ts`; `packages/server/src/domains/auth/routes/config.ts`; `routes/team.ts`; `packages/server/src/domains/documents/tenant/auth-config.ts`; `packages/server/src/domains/auth/adapters/zitadel`; `packages/client/src/admin/components/auth-settings`.  
**Stale claims:** “Still to build”/“target” sections mix completed work with old assumptions; team roles are no longer the described Postgres `teamRoles` model; paths and provider registration have changed.  
**Disposition:** Correct status and role model; preserve configuration-layer design.

## `docs/2026-07-25/PAGE-ROUTING.md`

**Classification:** stale-needs-correction.  
**Factual implementation status:** Page-tree resolution, URL-based edge loading, platform-route separation, and editor URL loading are implemented.  
**Evidence:** `packages/server/src/domains/documents/services/pages.service.ts`; `packages/server/src/domains/documents/routes/pages.ts`; `packages/client/src/platform/use-app-page-loader.ts` (URL query branch); `packages/client/src/platform-routes.ts`; `packages/seeding/src/profiles/platform/index.ts`; page tests.  
**Stale claims:** It labels the work an implementation plan and describes steps 1–6 as work to do; client and server file names/seed locations are old.  
**Disposition:** Convert to current implementation reference and update validation commands/paths.

## `docs/2026-07-25/PER-ORG-MODEL.md`

**Classification:** stale-needs-correction.  
**Factual implementation status:** Org-scoped URLs/documents/auth and platform-vs-merchant route separation remain valid. Current model includes additional platform capabilities and authorization scope.  
**Evidence:** `packages/workers/src/resolve-slug.ts`; `packages/client/src/platform/use-app-page-loader.ts`; `packages/server/src/domains/documents`; `packages/server/src/domains/auth/scope`; `AUTHORITATIVE-ROADMAP-CURRENT.md`.  
**Stale claims:** It presents old admin/platform component paths and only a simple layout/content runtime; it omits current editor/collab, Keto scope, Commerce vertical ownership, and seeding package.  
**Disposition:** Correct the current ownership/storage map; leave the conceptual multi-org explanation.

## `docs/2026-07-25/PERMISSIONS-OSS-REFERENCES.md`

**Classification:** design-reference.  
**Factual implementation status:** Its library comparisons are historical/design guidance, not implementation status. Current repository has an authorization port/Keto adapter and Automerge/Yjs collaboration, so the “start in-app / add later” conclusion is no longer current.  
**Evidence:** `packages/server/src/domains/auth/authorization-port.ts`; `packages/server/src/domains/auth/adapters/keto`; `packages/client/src/editor/collab`; `packages/server/src/domains/collab`; commits `b09534c`, `68a182b`, `b7462d0`.  
**Stale claims:** Recommends Postgres tuples and future Automerge/Hocuspocus as if not yet implemented; says SpiceDB/Keto choices are future/uncertain.  
**Disposition:** Leave as design-reference but mark historical recommendations and link current implementation.

## `docs/2026-07-25/PERMISSIONS-REBAC.md`

**Classification:** stale-needs-correction.  
**Factual implementation status:** Zanzibar-shaped authorization and document-scope concepts are implemented beyond the proposed Postgres-only sketch; Keto adapter, authorization port, document guards, and collaboration/op-log paths exist.  
**Evidence:** `packages/server/src/domains/auth/authorization-port.ts`; `packages/server/src/domains/auth/adapters/keto`; `packages/server/src/domains/auth/scope`; `packages/server/src/domains/documents/routes/document-write-guard.ts`; `packages/server/src/domains/documents/routes/document-ops.ts`; `packages/server/src/domains/collab`.  
**Stale claims:** Status says Postgres tuples/no SpiceDB as v1 while current code uses Keto; implementation phases call editor/collaboration future; field/role descriptions conflict with later `FIELD-ACL` direction and current scope model.  
**Disposition:** Correct to current authorization architecture and separate implemented behavior from future policy.

## `docs/2026-07-25/PHASE-3-STORE-SLUG.md`

**Classification:** stale-needs-correction.  
**Factual implementation status:** Slug-based host/path tenant resolution remains implemented and tested.  
**Evidence:** `packages/workers/src/resolve-slug.ts`; `packages/workers/src/resolve-slug.test.ts`; `packages/workers/src/routes/resolve-proxy-org.ts`; `packages/server/src/domains/tenant/routes/resolve.ts`; client tenant/page loader code.  
**Stale claims:** Old exact client/server paths and “Phase 3” framing; later edge behavior and current deployment/production status are absent.  
**Disposition:** Correct paths and mark as implemented infrastructure reference rather than roadmap phase.

## `docs/2026-07-25/PLATFORM-STATUS.md`

**Classification:** stale-needs-correction.  
**Factual implementation status:** This is the most materially stale status snapshot. Current roadmap records visual editor/collaboration, flags, machines, webhooks/integrations, notifications, analytics, evidence, seeding, fixtures, Commerce checkout hardening, and Orders UI as implemented/current-scope.  
**Evidence:** `docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md`; corresponding current package paths; commits `2d140c5`, `2af6d8a`, `35cc1e7`, `e2b29e4`, `11a579e`.  
**Stale claims:** D visual editor is “not done”; old tenant-MF and account/admin next lists; old API/header and seed assumptions; no Commerce vertical/evidence/Orders baseline.  
**Disposition:** Do not leave as status. Replace contents or prominently mark historical and point to the authoritative roadmap.

## `docs/2026-07-25/RESOLVE-REFS.md`

**Classification:** stale-needs-correction.  
**Factual implementation status:** Batch reference resolution remains implemented and tested in the documents refs subsystem.  
**Evidence:** `packages/server/src/domains/documents/routes/refs.ts`; `packages/server/src/domains/documents/refs/resolve.ts`; `packages/server/src/domains/documents/refs/resolve.test.ts`; `packages/server/src/domains/documents/refs/inbound.ts`.  
**Stale claims:** Old root file names and route wiring; does not mention current document authorization/scope or current client/editor consumers.  
**Disposition:** Correct paths and current security/consumer notes; retain endpoint contract after test confirmation.

## `docs/2026-07-25/SECURITY-HANDOFF.md`

**Classification:** stale-needs-correction.  
**Factual implementation status:** Auth hardening themes remain relevant, but current authorization and document-write guards have materially changed.  
**Evidence:** `packages/server/src/domains/auth/routes/role-guards.ts`; `packages/server/src/domains/auth/routes/scope.ts`; `packages/server/src/domains/auth/scope`; `packages/server/src/domains/documents/routes/document-write-guard.ts`; `packages/server/src/domains/auth/adapters/zitadel/authorizations.ts`; security tests.  
**Stale claims:** It describes `teamRoles` persistence/bootstrap and old route structure as current, while current code uses ZITADEL authorizations and Keto/scope infrastructure; “editor vs admin” gaps and direct API assumptions need re-audit.  
**Disposition:** Correct or supersede with a new security handoff based on current guards; do not use this as current security sign-off.

## `docs/2026-07-25/SPEC-DRIVEN-UI.md`

**Classification:** stale-needs-correction.  
**Factual implementation status:** Spec/catalog/action architecture remains a governing design principle, and current platform/editor loader follows it.  
**Evidence:** `packages/client/src/platform/use-app-page-loader.ts`; `packages/client/src/platform/registry.ts`; `packages/client/src/editor`; `packages/client/src/admin`; `packages/server/src/domains/documents`.  
**Stale claims:** It says public routing still uses temporary `templateFromPath`, treats flat props as v1 debt, and lists old file locations; later commits include flat-props migration and a live editor.  
**Disposition:** Correct current routing/props/editor status and preserve the anti-drift rules.

## `docs/2026-07-25/SPEC-STORAGE-MERGE.md`

**Classification:** stale-needs-correction.  
**Factual implementation status:** Dot-path merge remains implemented; editor drafts, document ops, Automerge collaboration, and server collab now exist. `validateSpec` is still only structural in `packages/server/src/domains/documents/services/layout-helpers.ts`, so the document is partly right but its phase framing is stale.  
**Evidence:** `packages/server/src/domains/documents/merge.ts`; `layout-helpers.ts`; `packages/client/src/editor/hooks/use-layout-draft.ts`; `packages/server/src/domains/documents/routes/document-ops.ts`; `packages/server/src/domains/collab`; `packages/client/src/editor/collab`.  
**Stale claims:** Visual editor/op-log/collab are marked planned; old API sketches are not current contracts; “catalog Zod validation target” needs explicit current limitation.  
**Disposition:** Correct implementation status and API references; retain merge model and explicitly record structural-validation limitation.

## `docs/2026-07-25/TEAM-ROLES-ZITADEL.md`

**Classification:** stale-needs-correction.  
**Factual implementation status:** The central decision—ZITADEL owns team roles, Postgres is not the role source—is current in implementation direction. Current code lists and updates ZITADEL project authorizations and has separate authorization scope/Keto adapters.  
**Evidence:** `packages/server/src/domains/auth/adapters/zitadel/authorizations.ts`; `packages/server/src/domains/auth/service.ts`; `packages/server/src/domains/auth/scope`; `packages/server/src/domains/auth/authorization-port.ts`; `packages/auth/src/permissions.ts`.  
**Stale claims:** “Current code still writes teamRoles” and old `teamRoleFromJwt`/route assumptions are not a reliable current description; the document omits current scope authorization and may overstate JWT-only evaluation.  
**Disposition:** Correct to distinguish ZITADEL role assignment, token role consumption, and Keto document scope.

## `docs/2026-07-25/TENANT-MF-CDN.md`

**Classification:** stale-needs-correction.  
**Factual implementation status:** Tenant catalog bundling/publish routes and R2 abstractions exist again in the current tree, with source validation and Module Federation bundling.  
**Evidence:** `packages/server/src/domains/tenant/adapters/bundler.ts`; `packages/server/src/domains/tenant/routes/catalog.ts`; `routes/components.ts`; `packages/server/src/domains/tenant/adapters/r2.ts`; `packages/server/src/domains/tenant/worker.ts`; `packages/client/src/catalog-loader.ts`.  
**Stale claims:** Header says “code reverted”; file list and CDN/API delivery details describe a previous implementation that differs from current route decomposition and storage/worker wiring.  
**Disposition:** Correct against current tenant code; retain CDN architecture only after verifying actual deployment path.

## `docs/2026-07-25/TENANT-MF-GIT.md`

**Classification:** design-reference.  
**Factual implementation status:** Git repository integration remains a proposed production source strategy; current tenant routes accept/publish component source and bundler validates/builds it, but no evidence here establishes the described Git app/webhook pipeline.  
**Evidence:** `packages/server/src/domains/tenant/routes/components.ts`; `packages/server/src/domains/tenant/adapters/bundler.ts`; `packages/server/src/domains/tenant/worker.ts`; absence of a Git integration in `packages/server/src/domains/tenant`.  
**Stale claims:** “Pipeline exists” is only true for bundling/publishing, not Git fetch/validation/webhooks; planned Postgres fields and admin UI are not current contracts.  
**Disposition:** Leave as design-reference, explicitly label Git integration unimplemented.

## `docs/2026-07-25/TENANT-MF-HANDOFF.md`

**Classification:** historical.  
**Factual implementation status:** It accurately records a 2026-07-25 implementation/revert session, but it is not a current tree changelog. Current tenant code has since reappeared/evolved.  
**Evidence:** document’s own “reverted” record; current `packages/server/src/domains/tenant`; commits after the original handoff and current tenant tests.  
**Stale claims:** “not in tree now,” exact 63-test count, and file-by-file change list are historical rather than current.  
**Disposition:** Leave and mark clearly historical; do not correct the historical narrative, but add a pointer to current code if desired.

## `docs/2026-07-25/TENANT-MF-REIMPL.md`

**Classification:** historical.  
**Factual implementation status:** It is an instruction set for rebuilding a feature that was intentionally reverted at the time; current tenant bundling exists but does not prove every listed step/contract.  
**Evidence:** `packages/server/src/domains/tenant`; current bundler tests; current tenant routes; git history showing later tenant/Commerce changes.  
**Stale claims:** “Code reverted” and target 63-test/minimal file checklist are no longer an accurate implementation plan.  
**Disposition:** Leave as historical reimplementation notes or archive; do not present as current build order.

## `docs/2026-07-25/TENANT-MF-SECURITY.md`

**Classification:** design-reference.  
**Factual implementation status:** Threat model remains applicable. Some defenses are now present in `bundler.ts` (size/forbidden-pattern checks and timeout-related build controls), but the document’s full required-control checklist is not demonstrated as complete.  
**Evidence:** `packages/server/src/domains/tenant/adapters/bundler.ts`; tenant component routes; `packages/server/src/domains/auth/routes/role-guards.ts`; current worker/manifest code.  
**Stale claims:** “not enforced” is partly outdated for source-size/forbidden-pattern validation; authz, allowlist, audit, isolation, and CDN integrity claims remain design/gap assertions requiring current tests.  
**Disposition:** Leave as design-reference, update the implemented-vs-gap table before using it for a production gate.

## `docs/2026-07-25/VISUAL-EDITOR-IMPLEMENTATION-ORDER.md`

**Classification:** stale-needs-correction.  
**Factual implementation status:** The visual editor and collaboration stack are implemented for current scope; Automerge/Yjs and server collab code exist.  
**Evidence:** `packages/client/src/editor`; `packages/client/src/editor/collab`; `packages/server/src/domains/collab`; `packages/server/src/domains/auth/scope`; `AUTHORITATIVE-ROADMAP-CURRENT.md`; commits `68a182b`, `b7462d0`, `05f7434`.  
**Stale claims:** Steps 1–10 are presented as future sequence, editor is blocked on permissions, and external FGA selection is described as pending despite current Keto/authorization code.  
**Disposition:** Replace with a current implementation/remaining-gaps document; preserve the historical rationale separately.

## `docs/2026-07-25/VISUAL-EDITOR-PLAN.md`

**Classification:** stale-needs-correction.  
**Factual implementation status:** Editor shell, canvas, panels, persistence, edit-mode routing, and collaboration are present; permissions/scope are implemented beyond the old “before UI” plan, though exact production completeness still needs verification.  
**Evidence:** `packages/client/src/editor`; `packages/client/src/platform/use-app-page-loader.ts`; `packages/server/src/domains/collab`; `packages/server/src/domains/documents/routes/document-write-guard.ts`; `packages/server/src/domains/auth/scope`.  
**Stale claims:** Header says planned and says do not ship UI until future Phase 0; current roadmap says visual editor implemented/live-smoke verified.  
**Disposition:** Correct to current implementation plus remaining hardening; do not leave as the next-build authority.

## `docs/2026-07-25/VISUAL-EDITOR-UX.md`

**Classification:** stale-needs-correction.  
**Factual implementation status:** The interaction model is now substantially implemented, including editor shell, canvas, save bar, presence, layers, agent panel, and collaboration.  
**Evidence:** `packages/client/src/editor/components/shell`; `components/canvas`; `components/panel/PropsPanel.tsx`; `components/layers`; `components/shell/CollabPresenceBar.tsx`; `packages/client/src/editor/collab`; current editor tests.  
**Stale claims:** It calls the entire model a Phase D design target and says live collab/presence are later; current UI is broader than the minimal diagram and needs a current screenshot/live verification note.  
**Disposition:** Correct as an implementation/UX reference and split remaining UX ideas from shipped behavior.

## `docs/2026-07-25/ROADMAP-PHASES.md`

**Classification:** historical.  
**Factual implementation status:** The file explicitly identifies itself as a historical roadmap snapshot. Its 2026-07-25 phase record is useful evidence of prior sequencing, not current truth.  
**Evidence:** header lines 3–5; `docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md`; commits after 2026-07-25.  
**Stale claims:** Phase D and tenant/editor “next” items are superseded; current baseline includes capabilities not represented here.  
**Disposition:** Leave marked historical and keep the explicit link to the authoritative current roadmap.

## Final disposition

- **Leave as historical:** `TENANT-MF-HANDOFF.md`, `TENANT-MF-REIMPL.md`, `ROADMAP-PHASES.md`.
- **Leave as design-reference (with implemented/gap annotations):** `PERMISSIONS-OSS-REFERENCES.md`, `TENANT-MF-GIT.md`, `TENANT-MF-SECURITY.md`.
- **Correct:** all other assigned documents, especially `PLATFORM-STATUS.md`, `ARCHITECTURE-MAP.md`, the visual-editor trio, permissions documents, and Commerce/extension documents.
- **No existing document or source file was modified by this audit.**
