# Audit: editor and identity documents

**Audit date:** 2026-09-14  
**Scope:** Every Markdown file directly under `docs/2026-08-01` and `docs/2026-08-03` (21 documents). No documents outside those assigned paths were audited.  
**Evidence basis:** Current source, tests, package manifests, compose/configuration, seed code, and recent git history through the current checkout. The 2026-08-06 E3 collab document was used as an evidence reference where the assigned 2026-08-01 docs point to it; it was not audited as an assigned document.

## Classification summary

| Classification | Count |
|---|---:|
| Current | 6 |
| Historical | 2 |
| Design-reference | 0 |
| Stale-needs-correction | 13 |
| Unclear | 0 |

---

## 1. `docs/2026-08-01/CLIENT-UI-ARCHITECTURE-AUDIT.md`

**Classification:** **stale-needs-correction**  
**Factual implementation status:** The document remains a useful static architecture/a11y/performance review, and several findings remain valid. However, its P0 snapshot predates shipped editor actions and later live collaboration. `editorActionHandlers` are now wired in `packages/client/src/editor/registry.ts`; handlers live in `packages/client/src/editor/actions.ts`. The draft hooks still directly call document APIs (`packages/client/src/editor/hooks/use-layout-draft.ts`, `use-content-draft.ts`, `use-editor-prefs.tsx`), so the direct-API architectural concern remains. Shared document APIs now exist in `packages/client/src/documents/`. Shell layout/labels are seeded in `packages/seeding/src/profiles/platform/index.ts` and `demo-specs.ts`. Accessibility/performance concerns are not demonstrably all fixed.

**Evidence:** `packages/client/src/editor/registry.ts`; `packages/client/src/editor/actions.ts`; `packages/client/src/editor/hooks/use-layout-draft.ts`; `packages/client/src/editor/hooks/use-content-draft.ts`; `packages/client/src/documents/`; `packages/seeding/src/profiles/platform/demo-specs.ts`; `packages/client/src/editor/schemas/components.ts`.

**Stale claims:** Lines 26 and 57 describe editor actions as unimplemented (`actions: {} as never`), which is no longer true. The document also presents the editor as solo/409-only by omission; live collab now exists under `packages/client/src/editor/collab/` and `packages/server/src/domains/collab/`. The hooks' direct API bypass should remain listed, but the wording should distinguish implemented handlers from unused orchestration paths.

**Disposition:** **Correct**, preserving still-valid findings and adding a dated/current-status note; do not mark historical because it is intended as a reusable audit baseline.

## 2. `docs/2026-08-01/CLIENT-UI-REMEDIATION-PLAN.md`

**Classification:** **stale-needs-correction**  
**Factual implementation status:** The listed P0/P1/P2 work is substantially implemented, but the all-✅ status overstates completion. In particular, editor draft hooks still call `getLayoutForTemplate`, `saveLayout`, `loadEntryFields`, and `saveContentEntry` directly rather than routing all orchestration through `execute`/`$state`. Editor action handlers are wired, but this does not prove the hook refactor claimed by task 2. The edge/spec shell path is implemented through `packages/client/src/editor/hooks/use-edit-page-orchestration.ts` and `packages/server/src/domains/edge/service.ts`.

**Evidence:** `packages/client/src/editor/hooks/use-layout-draft.ts`; `packages/client/src/editor/hooks/use-content-draft.ts`; `packages/client/src/editor/hooks/use-editor-prefs.tsx`; `packages/client/src/editor/registry.ts`; `packages/client/src/editor/actions.ts`; `packages/client/src/editor/hooks/use-edit-page-orchestration.ts`; `packages/server/src/domains/edge/service.ts`.

**Stale claims:** Tasks 1–15 are marked complete although the direct-hook/action refactor is incomplete. The plan has no status for the subsequently shipped live collab implementation. The verification commands are instructions, not evidence of a current full `typecheck`, `fix`, and `test` run.

**Disposition:** **Correct** statuses and add a collab/op-log status; retain completed items only where source evidence supports them.

## 3. `docs/2026-08-01/COLLAB-EDITOR-SETUP.md`

**Classification:** **stale-needs-correction**  
**Factual implementation status:** The solo/409/session-undo fallback described in the document still exists, but the central assertion that live collaboration is deferred is obsolete. Layout collaboration is implemented with a client hook and collab adapters, server layout rooms, WebSocket/ticket routes, presence, Redis relay, and tests. Rich-text Yjs room support also exists. Dependencies are present in `packages/client/package.json` and `packages/server/package.json`.

**Evidence:** `packages/client/src/editor/collab/use-layout-collab.ts`; `packages/client/src/editor/collab/`; `packages/server/src/domains/collab/layout-room.ts`; `packages/server/src/domains/collab/richtext-yjs-room.ts`; `packages/server/src/domains/collab/routes.ts`; `packages/server/src/domains/collab/collab-redis-relay.ts`; collab tests under `packages/client/src/editor/collab/` and `packages/server/src/domains/collab/`; `packages/client/package.json`; `packages/server/package.json`; `docs/2026-08-06/E3-LIVE-CRDT-COLLAB-IMPLEMENTATION.md`.

**Stale claims:** Header and sections 1–3 say collab is Phase 3/future and that there is no live merge/presence. Those claims conflict with the shipped E3 implementation and git commits `570a52f`, `ad2b9f4`, and `72b3a59`.

**Disposition:** **Correct** into a current setup/operations document, clearly separating shipped E3a dogfood, remaining gaps, and the original v1 fallback. Do not leave the current “deferred” status.

## 4. `docs/2026-08-01/EDITOR-SMOKE-PRODUCT-DETAIL.md`

**Classification:** **historical**  
**Factual implementation status:** This is a dated manual smoke record, not a current specification. It explicitly records a 2026-08-05 run and marks numerous checks unverified: content-field editing, reparenting, selection/parent behavior, image picker, undo/redo, cross-device preferences, and two-tab UI conflict. The 409 behavior has automated service coverage.

**Evidence:** The document’s own run/checklist (`EDITOR-SMOKE-PRODUCT-DETAIL.md:3-9,24-67`); `packages/server/src/domains/documents/services/layouts.service.test.ts`; current editor implementations under `packages/client/src/editor/`.

**Stale claims:** None if interpreted as a historical run log. The URL/template note is specifically a record of the run and should not be read as current routing truth.

**Disposition:** **Leave** as an immutable historical smoke record. If desired, append a new dated run rather than rewriting this result.

## 5. `docs/2026-08-01/FIELD-ACL.md`

**Classification:** **current**  
**Factual implementation status:** The product decision not to build field-level ACL is current. Legacy server helpers exist (`filterReadFields`, `validateFieldWritePermissions`), but editor/admin paths do not pass role through the `/resolve` load/save path, so field ACL is not end-to-end productized. The preferred document/content-type access model is reflected by current collection and authorization code.

**Evidence:** `packages/server/src/domains/documents/services/content-write.ts`; `packages/server/src/domains/documents/routes/content.ts`; `packages/server/src/domains/documents/services/content.service.ts`; `packages/client/src/documents/content-entries.ts`; `packages/server/src/domains/documents/schema.ts`; `packages/server/src/domains/auth/deny-unless-document-access.ts`.

**Stale claims:** The legacy section is intentionally archival and labeled as such. The only correction needed is a dated verification note if the document is retained after future authorization changes.

**Disposition:** **Leave**. It accurately records a cancelled/deferred feature and distinguishes legacy code from product intent.

## 6. `docs/2026-08-01/VISUAL-EDITOR-BUILD-PLAN.md`

**Classification:** **stale-needs-correction**  
**Factual implementation status:** Core editor phases A–D and D8 are implemented in current editor/schema/seed code, but the document contains internal contradictions and incomplete smoke status. Current source supports the action picker and spec-driven shell; smoke remains partial. Live CRDT/collab and `document_ops` are now implemented, contrary to the post-v1 skip table.

**Evidence:** `packages/client/src/editor/registry.ts`; `packages/client/src/editor/actions.ts`; `packages/client/src/editor/schemas/components.ts`; `packages/seeding/src/profiles/platform/demo-specs.ts`; `packages/server/src/domains/documents/schema.ts`; `packages/server/src/domains/collab/`; `packages/client/src/editor/collab/`; `packages/server/src/domains/documents/services/layouts.service.test.ts`; `docs/2026-08-06/E3-LIVE-CRDT-COLLAB-IMPLEMENTATION.md`.

**Stale claims:** Header/decision text says D8 is deferred, C8 says action props are hidden until D8, while the later backlog says D8 is done. The collab/CRDT and op-log skip statements are obsolete. Several phase smoke checkboxes are still only partial.

**Disposition:** **Correct** contradictions and update the post-v1 section; retain the plan as a historical build-plan only if it is explicitly dated.

## 7. `docs/2026-08-01/VISUAL-EDITOR-COLLAB-CRDT.md`

**Classification:** **stale-needs-correction**  
**Factual implementation status:** The header simultaneously says “E3a v1 dogfood” and “Not building now.” Current code has Automerge layout rooms/snapshots, Yjs rich-text rooms, presence, Redis cross-replica relay, routes, and tests. The document’s v1 fallback (local history and 409) remains valid, but its main “future-only” strategy is not.

**Evidence:** `packages/server/src/domains/collab/layout-room.ts`; `packages/server/src/domains/collab/richtext-yjs-room.ts`; `packages/server/src/domains/collab/collab-redis-relay.ts`; `packages/client/src/editor/collab/`; `packages/server/src/domains/collab/`; `packages/client/package.json`; `packages/server/package.json`; `docs/2026-08-06/E3-LIVE-CRDT-COLLAB-IMPLEMENTATION.md`; commits `570a52f`, `ad2b9f4`, `72b3a59`.

**Stale claims:** Sections 29–35 and 52–62 classify live collab as later v3 and state solo-only operation. Those statements must be replaced with shipped scope, dogfood limits, and remaining E3c/D7 gaps.

**Disposition:** **Correct**, using the 2026-08-06 implementation document as the newer baseline.

## 8. `docs/2026-08-01/VISUAL-EDITOR-GAP-ANALYSIS.md`

**Classification:** **stale-needs-correction**  
**Factual implementation status:** The editor inventory, D8 status, layout/content model, and partial smoke status are broadly supported. Collaboration and op-log status is not current: `document_ops` exists and is tested, and live collab is implemented.

**Evidence:** `packages/client/src/editor/`; `packages/server/src/domains/documents/schema.ts`; `packages/server/src/domains/documents/adapters/postgres.ts`; `packages/server/src/domains/documents/services/layouts.service.test.ts`; `packages/client/src/editor/collab/`; `packages/server/src/domains/collab/`; `docs/2026-08-06/E3-LIVE-CRDT-COLLAB-IMPLEMENTATION.md`.

**Stale claims:** The skip table and inventory classify `document_ops`, live CRDT, and presence as skipped/deferred. The remaining-gaps section repeats that obsolete status. The smoke is correctly described as partial.

**Disposition:** **Correct** the collab/op-log sections and add the E3 implementation status; preserve the feature inventory and partial-smoke caveat.

## 9. `docs/2026-08-03/ACCESS-AND-ROLES.md`

**Classification:** **current**  
**Factual implementation status:** This is the strongest current canonical access model: ZITADEL platform roles, `@noname/auth` permissions, Postgres collections/folders, Keto teams/bindings, direct document shares, and access-manager role caps are implemented. Current role/slot validation and scope routes/tests support the matrix.

**Evidence:** `packages/auth/src/permissions.ts`; `packages/auth/src/role-assignment.ts`; `packages/auth/src/role-assignment.test.ts`; `packages/auth/src/team-slot-validation.ts`; `packages/server/src/domains/auth/scope/`; `packages/server/src/domains/auth/routes/scope.ts`; `packages/server/src/domains/documents/schema.ts`; `packages/seeding/src/profiles/platform/demo-users.ts`; `packages/client/src/auth/document-scope.ts`.

**Stale claims:** The document calls folders “Keto parent walk (Phase F2)” while F1–F3 are now shipped; this is wording, not a model error. Any future changes should update the canonical role matrix and folder status together.

**Disposition:** **Leave**, with a small optional status/date correction for already-shipped folder inheritance/sidebar behavior.

## 10. `docs/2026-08-03/ADMIN-SOFT-NAV-HANDOFF.md`

**Classification:** **current**  
**Factual implementation status:** Soft navigation, stable shell/deferred panel, panel cache, catalog fingerprint refresh, focus/session revalidation, 401 redirect, and prefetch are present in current client code. The document correctly leaves optional MFA re-gating, crossfade, and cognitive-complexity cleanup open. Edge schema authentication is correctly identified as a pre-existing security decision.

**Evidence:** `packages/client/src/platform/use-app-page-loader.ts`; `packages/client/src/platform/admin-platform-view.tsx`; `packages/client/src/auth/admin-access.ts`; `packages/client/src/lib/api.ts`; `packages/client/src/auth/session.ts`; `packages/client/src/platform/catalog-loader.ts`; `packages/client/src/admin/admin-panel-prefetch.ts`; `packages/server/src/domains/edge/api.ts`.

**Stale claims:** No material stale implementation claim found. The dated “Aug 2026” status should remain a handoff snapshot.

**Disposition:** **Leave**; optionally add a verification date if this handoff becomes an evergreen reference.

## 11. `docs/2026-08-03/AGENT-OWNERSHIP-AND-REVIEW.md`

**Classification:** **current**  
**Factual implementation status:** Agent ownership, registered-agent links, owner/admin review guards, folder-agent edit bindings, and “agents never publish” boundaries are implemented. The document explicitly labels reviewer reassignment and owner departure alternatives as future/not fully implemented, which matches the source.

**Evidence:** `packages/server/src/domains/agent/registry-service.ts`; `packages/server/src/domains/agent/task-review-guard.ts`; `packages/server/src/domains/agent/routes/registry.ts`; `packages/server/src/domains/agent/routes/tasks.ts`; `packages/server/src/domains/agent/schema.ts`; `packages/server/src/domains/auth/scope/`; `packages/server/src/domains/agent/task-review-guard.test.ts`; `packages/server/src/domains/agent/registry-service.test.ts`.

**Stale claims:** None material. “Today” should be understood as the current checkout; the document already distinguishes implemented behavior from later options.

**Disposition:** **Leave**.

## 12. `docs/2026-08-03/AGENT-PHASE-2-MASTRA-SPEC.md`

**Classification:** **stale-needs-correction**  
**Factual implementation status:** The orchestrate task type, Mastra executor, structured steps/artifacts, guards, mock path, owner review, worker propagation, admin UI, and tests are implemented. The live planner remains dependent on configured LLM/Vault credentials, while mock orchestration is covered. The document’s next-action section still says to install Mastra and implement 2.1 even though `@mastra/core` integration exists.

**Evidence:** `packages/server/src/bootstrap.ts`; `packages/server/src/domains/agent/mastra/executor.ts`; `packages/server/src/domains/agent/mastra/tools/`; `packages/server/src/domains/agent/mastra/guards.ts`; `packages/server/src/domains/agent/worker.ts`; `packages/server/src/domains/agent/routes/tasks.ts`; `packages/server/src/domains/agent/mastra/*.test.ts`; `packages/client/src/admin/components/agents/AgentsAdminForm.tsx`; `packages/client/src/core/actions/agents.ts`; `packages/server/package.json`.

**Stale claims:** “Next action: Implement 2.1” is obsolete. The status should distinguish shipped mock/E2E behavior from open live-LLM validation. The file map and estimated implementation order are historical plan material, not current backlog truth.

**Disposition:** **Correct** status/next action and point to the current backlog/runbook; preserve acceptance criteria as a dated Phase 2 record.

## 13. `docs/2026-08-03/FOLDERS-SCOPE-PLAN.md`

**Classification:** **current**  
**Factual implementation status:** F1 flat folders, F2 nested folders, and F3 CMS sidebar are marked shipped and are represented by `content_collections`, `documents.collection_id`, parent handling, scope APIs, client document-scope helpers, and seeded folder access. The distinction from storefront product collections remains accurate.

**Evidence:** `packages/server/src/domains/documents/schema.ts`; `packages/server/src/domains/auth/scope/collections.ts`; `packages/server/src/domains/auth/scope/bindings.ts`; `packages/server/src/domains/auth/routes/scope.ts`; `packages/client/src/auth/document-scope.ts`; `packages/client/src/admin/components/`; `packages/seeding/src/profiles/platform/keto-tuples.ts`; git commit `a762297`.

**Stale claims:** The “approve to start Phase 1” footer is obsolete after the F1–F3 shipped status. The document also says “same as today’s tag bindings” as historical migration context; current code treats collections/folders as the active model.

**Disposition:** **Correct** the approval footer and migration tense, otherwise leave as the current folder plan/reference.

## 14. `docs/2026-08-03/IDENTITY-AGENTS-MASTER-PLAN.md`

**Classification:** **stale-needs-correction**  
**Factual implementation status:** ZITADEL roles, app permissions, Keto authorization, agent registry/tokens, delegated task flow, Vault/secret integration, and human review are implemented in substantial form. The document remains a useful architectural decision record, but its phase tables are behind the repository: folders have replaced tags and agent v1/`nag.*` tokens are shipped.

**Evidence:** `packages/auth/src/permissions.ts`; `packages/server/src/domains/auth/authorization-port.ts`; `packages/server/src/domains/auth/adapters/keto/authorization.ts`; `packages/server/src/domains/agent/agent-token.ts`; `packages/server/src/domains/agent/registry-service.ts`; `packages/server/src/domains/agent/mastra/executor.ts`; `packages/server/src/domains/secrets/`; `packages/server/src/domains/integrations/`; `packages/server/src/domains/documents/schema.ts`; `packages/seeding/src/profiles/platform/keto-tuples.ts`.

**Stale claims:** Phase B still describes tags and future Keto deployment despite current folder/collection implementation; A′.3 is marked shipped elsewhere but the phase table presents it as next work; tuple examples use `tag:marketing` even though collections are the current scope model. R6/R7 and production-hardening notes need a fresh status.

**Disposition:** **Correct** phase tables and tuple examples; retain the IdP/Nostr architectural decisions.

## 15. `docs/2026-08-03/KETO-IMPLEMENTATION-CHECKLIST.md`

**Classification:** **stale-needs-correction**  
**Factual implementation status:** Keto DB/compose/config, AuthorizationPort, REST adapter, always-on checks, collection scope UI, seeded tuples, agent token path, and much of the checklist are implemented. However, the checklist mixes the retired tag model with the current folder model and marks important tests/links as open without reconciling later shipped work.

**Evidence:** `docker-compose.yml`; `scripts/compose/init-dbs.sh`; `scripts/compose/ensure-extra-dbs.sh`; `config/keto/keto.yml`; `config/keto/namespaces.ts`; `packages/server/src/domains/auth/authorization-port.ts`; `packages/server/src/domains/auth/adapters/keto/authorization.ts`; `packages/server/src/domains/auth/scope/`; `packages/server/src/domains/auth/routes/scope.ts`; `packages/seeding/src/profiles/platform/keto-tuples.ts`; `packages/server/src/domains/auth/adapters/keto/authorization.test.ts`.

**Stale claims:** Step 3 lists Tag as a current namespace; Step 6.6 says tags are on content/layout; the current schema has `collection_id`/`content_collections`. Step 4.3 says the identity-plan link is open even though the link is present. “Next: tags + admin scope UI (N8–N10)” is obsolete. Production K8s tasks and integration-test gaps may remain open.

**Disposition:** **Correct** to a current folder/collection checklist, retaining explicit open production deployment and test items.

## 16. `docs/2026-08-03/KETO-ZANZIBAR-ROADMAP.md`

**Classification:** **stale-needs-correction**  
**Factual implementation status:** Keto is in compose and the server authorization adapter is active. Folder/collection scope, direct shares, and agent paths exist. The roadmap’s broad decision “Keto only, not SpiceDB” remains current.

**Evidence:** `docker-compose.yml`; `config/keto/namespaces.ts`; `packages/server/src/domains/auth/authorization-port.ts`; `packages/server/src/domains/auth/adapters/keto/authorization.ts`; `packages/server/src/domains/auth/scope/`; `packages/server/src/domains/documents/schema.ts`; `packages/server/src/domains/agent/`; `packages/seeding/src/profiles/platform/keto-tuples.ts`.

**Stale claims:** The “Now/B1/B2” table and N8–N10 tasks describe tags as the active model, while F1–F3 folders are shipped. The quick reference says “NEXT B2 collections” even though collections are current. The publish flow text must match current document-access checks rather than the older “admin only” simplification where applicable.

**Disposition:** **Correct** roadmap statuses and replace tag phases with the shipped folder phases plus real remaining production/list-performance work.

## 17. `docs/2026-08-03/LLM-CREDENTIALS-PER-ORG.md`

**Classification:** **stale-needs-correction**  
**Factual implementation status:** Vault-backed org secrets, environment fallback, provider resolution, write-only admin/API handling, client actions/UI, and tests are implemented. Nango is now also in compose and wired into integrations, although the approved LLM decision remains Vault rather than Nango. Regular provider resolution checks org secret, platform secret, then mock; planner resolution has an additional environment path.

**Evidence:** `packages/server/src/domains/secrets/adapters/vault.ts`; `packages/server/src/domains/secrets/adapters/env-fallback.ts`; `packages/server/src/domains/secrets/service.ts`; `packages/server/src/domains/secrets/service.test.ts`; `packages/server/src/domains/integrations/routes/llm.ts`; `packages/server/src/domains/integrations/service.ts`; `packages/server/src/domains/integrations/index.ts`; `packages/client/src/core/actions/integrations.ts`; `docker-compose.yml`; `packages/server/src/domains/ai-pipeline/schema.ts`; `packages/server/src/domains/ai-pipeline/adapters/postgres.ts`.

**Stale claims:** The Nango inventory says no service/wiring, contradicted by `docker-compose.yml` and integrations code. The document proposes `llm_usage`, but current code writes `ai_generations`; no `llm_usage` table was found. `allowPlatformFallback` is stored/exposed but not enforced by `packages/server/src/domains/secrets/service.ts`. The target table says platform env keys, while configured Vault platform secrets are preferred. The proposed public `model`/`keySource` shape is narrower in current service output.

**Disposition:** **Correct** the inventory and effective behavior; preserve the approved Vault-not-Nango product decision if still intended.

## 18. `docs/2026-08-03/OBSERVABILITY-AND-TRACES.md`

**Classification:** **current**  
**Factual implementation status:** Server OTel bootstrap, org tagging, browser traceparent propagation, browser span ingest/re-export, Jaeger proxy with org filtering, trace permission, admin UI, analytics cross-link, compose Jaeger, and demo seed are implemented and tested.

**Evidence:** `packages/server/src/tracing.ts`; `packages/server/src/shared/org-tracing.ts`; `packages/server/src/domains/analytics/routes/ingest.ts`; `packages/server/src/domains/analytics/browser-span-export.ts`; `packages/server/src/domains/analytics/routes/traces.ts`; `packages/server/src/domains/analytics/jaeger-client.ts`; `packages/server/src/domains/analytics/read-guards.ts`; `packages/client/src/platform/browser-observability.ts`; `packages/browser-sdk/src/modules/trace.ts`; `packages/client/src/admin/components/traces/TracesAdmin.tsx`; `packages/client/src/admin/components/analytics/AnalyticsEventsAdmin.tsx`; `packages/server/src/domains/analytics/*.test.ts`; `docker-compose.yml`; `packages/seeding/src/profiles/platform/demo-users.ts`.

**Stale claims:** No material status error. Minor implementation detail: browser spans are ingested and re-exported server-side, and Jaeger results receive defense-in-depth post-filtering; the document’s summary is still materially accurate.

**Disposition:** **Leave**.

## 19. `docs/2026-08-03/ROADMAP-PHASES-B-A-C.md`

**Classification:** **stale-needs-correction**  
**Factual implementation status:** The four-layer framing remains useful. Platform permissions, Keto, folders F1–F3, agent registry/orchestrate mock/admin review, and `nag.*` token paths are substantially shipped. CRDT is no longer wholly deferred: live collab exists, although production hardening/dogfood limitations may remain.

**Evidence:** `packages/auth/src/permissions.ts`; `packages/server/src/domains/auth/`; `packages/server/src/domains/documents/schema.ts`; `packages/server/src/domains/agent/`; `packages/client/src/admin/components/agents/AgentsAdminForm.tsx`; `packages/client/src/editor/collab/`; `packages/server/src/domains/collab/`; `packages/server/src/domains/documents/services/layouts.service.test.ts`; `docs/2026-08-06/E3-LIVE-CRDT-COLLAB-IMPLEMENTATION.md`.

**Stale claims:** The document simultaneously says folders are done and lists tag scope as current/remaining; agent tables list shipped token work as remaining; the code-today table says CRDT/live presence is absent, contradicted by collab code. The “next” list must be reconciled with the newer build index and E3 status.

**Disposition:** **Correct** into a current roadmap; retain the layer model and explicit production-hardening gates.

## 20. `docs/2026-08-03/ROLES-AND-SCOPE-v2.md`

**Classification:** **historical**  
**Factual implementation status:** The document is explicitly an implementation companion superseded by `ACCESS-AND-ROLES.md`, and its tag/team model is no longer the current scope model. Current code uses collections/folders (`documents.collection_id`, `content_collections`) and current role keys include `access_manager`.

**Evidence:** `docs/2026-08-03/ROLES-AND-SCOPE-v2.md:1-7`; `docs/2026-08-03/ACCESS-AND-ROLES.md`; `packages/server/src/domains/documents/schema.ts`; `packages/server/src/domains/auth/scope/`; `packages/auth/src/permissions.ts`; `packages/auth/src/role-assignment.ts`.

**Stale claims:** Tag source-of-truth, tag admin UI, tag build order, and tag-based API checks are obsolete. The file’s own supersession marker is accurate.

**Disposition:** **Leave** as historical/reference context, or mark more prominently “archived—do not use for implementation.” Do not correct it into a second canonical role model.

## 21. `docs/2026-08-03/ROLES-AND-SCOPE.md`

**Classification:** **historical**  
**Factual implementation status:** This six-line pointer is intentionally superseded and accurately directs readers to `ACCESS-AND-ROLES.md` and `ROLES-AND-SCOPE-v2.md`.

**Evidence:** `docs/2026-08-03/ROLES-AND-SCOPE.md`; `docs/2026-08-03/ACCESS-AND-ROLES.md`; `docs/2026-08-03/ROLES-AND-SCOPE-v2.md`; current role implementation in `packages/auth/src/permissions.ts`.

**Stale claims:** None beyond the historical v1 description, which is explicitly labeled superseded.

**Disposition:** **Leave** unchanged as the migration pointer.

---

## Repository-history note

Recent history confirms that the assigned documents span multiple implementation waves: folder work (`a762297`), agents/permissions (`438afd7`), tracing (`8d281b1`), Vault/Nango documentation and integrations (`99dd7d2`, `aa1899e`), and live collaboration (`570a52f`, followed by later collab commits). The principal audit risk is therefore not missing evidence but dated plans retaining pre-folder, pre-agent-hardening, pre-Vault, or pre-E3 status text.

**Document count audited: 21.**
