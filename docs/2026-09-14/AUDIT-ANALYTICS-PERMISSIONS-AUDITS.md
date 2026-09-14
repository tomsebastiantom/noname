# Audit: analytics, permissions, and repository audits

**Audit date:** 2026-09-14  
**Assigned scope:** Every Markdown file under `docs/2026-07-27`, `docs/2026-07-30`, and `docs/2026-07-31` only.  
**Method:** Read all 21 assigned documents; compared claims with current source, tests, package manifests, seeders, and recent history. Relevant history includes `8380eef`/`8edcca9` (analytics), `97ceb52`/`d9de1d8` (permissions), `a28f205` (Dragonfly), `5833c16`/`9c1b97f`/`097365c` (domain/architecture cleanup), `020feda`/`522a2cd` (props and shell refactors), `b09534c` (Keto authorization), and `1644b4c` (replay stitching/compression).

## Classification key

- **current** — factual snapshot/convention agrees with the repository; leave in place (routine dated test records may instead be historical).
- **historical** — an accurate record of a past run or fix, not a current status authority; leave and treat as historical.
- **design-reference** — an intentional decision, model, or proposal rather than an implementation-status report; leave as reference.
- **stale-needs-correction** — contains materially outdated or internally contradictory implementation claims; correct the document (not done in this audit).
- **unclear** — evidence is insufficient or claims need an explicit owner decision.

## 1. `docs/2026-07-27/ANALYTICS-REPLAY-PENDING.md`

**Classification:** stale-needs-correction.  
**Implementation status:** Most feature-status claims are now implemented: replay session read routes and user filtering exist, `analytics:view` exists, and gzip replay is implemented. Evidence: `packages/server/src/domains/analytics/routes/replay.ts`, `packages/server/src/domains/analytics/read-auth.test.ts`, `packages/auth/src/permissions.ts`, `packages/browser-sdk/src/core/replay-compress.ts`, `packages/server/src/domains/analytics/replay-ingest.ts`, and `packages/server/src/domains/analytics/replay-ingest.test.ts`.  
**Stale/contradictory claims:** The final line still says replay compression is queued, contradicting the table at lines 67–71 and current code. The document also presents a “pending” snapshot while recording later shipped work, so its open-work list is not a reliable current backlog.  
**Disposition:** Correct the footer/backlog and clearly separate completed historical verification from remaining Playwright work; do not delete (the P4 decisions and evidence remain useful).

## 2. `docs/2026-07-27/ANALYTICS-REPLAY-TEST-RUN.md`

**Classification:** historical.  
**Implementation status:** This is explicitly a 2026-07-27 manual run. Its then-current BullMQ/Dragonfly failure and skipped replay playback are historical; the Dragonfly fix is recorded in history (`a28f205`) and current queue/ingest behavior is represented by `packages/server/src/domains/analytics/browser-ingest.test.ts` and `packages/server/src/domains/analytics/replay-ingest.test.ts`.  
**Stale claims:** The “302” expectation/result and pre-fix 500 observations must not be read as current behavior; later sections already record the fix, but the document retains both states.  
**Evidence:** `packages/workers/src/routes/public-routes.test.ts`, `packages/server/src/domains/analytics/read-auth.test.ts`, `packages/server/src/domains/analytics/browser-ingest.test.ts`, `packages/server/src/domains/analytics/replay-ingest.test.ts`.  
**Disposition:** Leave unchanged as a dated test record; optionally add a prominent “superseded by current tests” note.

## 3. `docs/2026-07-27/BROWSER-SDK-INTEGRATION.md`

**Classification:** stale-needs-correction.  
**Implementation status:** Browser SDK, ClickHouse ingest, flags, replay, org-header handling, client wiring, read authorization, replay UI, user stitching, and compression are implemented. Evidence: `packages/browser-sdk/src/index.ts`, `packages/browser-sdk/src/modules/flags.ts`, `packages/browser-sdk/src/core/replay-compress.ts`, `packages/client/src/platform/browser-observability.ts`, `packages/server/src/domains/analytics/routes/replay.ts`, `packages/server/src/domains/analytics/read-auth.test.ts`, `packages/auth/src/permissions.ts`.  
**Stale claims:** Lines 105–115 say there is no `analytics:view` and no replay download API, but the permission and replay read APIs exist. The “implementation plan (next coding slice)” repeats work already shipped. The header says dev replay sampling is 0 while current client bootstrap uses dev `sampleRate: 1` (the document itself says this at line 73).  
**Disposition:** Correct current-state tables and move shipped phases out of the next-slice plan; preserve the architecture/security explanation as reference.

## 4. `docs/2026-07-27/FLAGS-PER-USER-TARGETING.md`

**Classification:** current.  
**Implementation status:** Server `property_match` evaluation exists, while the SDK context getter still supplies `contextProperties: {}` and there is no `setFlagContext` implementation. Evidence: `packages/server/src/domains/flags/evaluation.ts`, `packages/server/src/domains/flags/ports.ts`, `packages/browser-sdk/src/index.ts`, `packages/browser-sdk/src/modules/flags.ts`, and `packages/client/src/platform/browser-observability.ts`.  
**Stale claims:** None material to the central conclusion. The suggested API is explicitly a proposed change, not asserted as shipped.  
**Disposition:** Leave as current design/implementation analysis.

## 5. `docs/2026-07-27/FLAGS-UI-LIVE-UPDATE-DECISION.md`

**Classification:** design-reference.  
**Implementation status:** The hybrid Type A path is implemented: SDK `onAnyUpdate`, client flag mirroring, and debounced layout refresh are present in `packages/browser-sdk/src/types.ts`, `packages/browser-sdk/src/modules/flags.ts`, `packages/client/src/platform/browser-observability.ts`, and `packages/client/src/platform/use-app-page-loader.ts`. The later Type B deferral is consistent with `docs/2026-07-30/ADMIN-PREVIEW-AND-FLAGS-SCOPE.md`.  
**Stale claims:** The early “nothing subscribed/UI frozen” flow is historical and is superseded by the implementation/decision sections, not a current claim.  
**Disposition:** Leave as a decision record; if reused as status documentation, add a short current implementation pointer.

## 6. `docs/2026-07-27/OBSERVABILITY-AUTH-MODEL.md`

**Classification:** stale-needs-correction.  
**Implementation status:** Anonymous ingest and post-login identity enrichment are implemented; read routes require permission; query-time replay stitching is implemented. Evidence: `packages/client/src/platform/browser-observability.ts`, `packages/browser-sdk/src/index.ts`, `packages/server/src/domains/analytics/browser-ingest.ts`, `packages/server/src/domains/analytics/read-auth.test.ts`, `packages/client/src/admin/session-replay.ts`.  
**Stale/contradictory claims:** The table at lines 20–21 says pre-login events are not backfilled, while lines 82–89 correctly say query-time session join shipped. “Trusted org from HMAC” in the read table is incomplete for current authenticated request handling.  
**Disposition:** Correct the first summary table and harmonize the ingest/read wording; retain the identity model.

## 7. `docs/2026-07-27/PERMISSIONS-IDP-COMPARISON.md`

**Classification:** design-reference.  
**Implementation status:** Current code does expand platform permission keys and uses ZITADEL/Keto authorization paths; evidence: `packages/auth/src/permissions.ts`, `packages/server/src/domains/auth/guards.ts`, `packages/server/src/domains/auth/adapters/keto/authorization.test.ts`, `packages/server/src/domains/auth/routes/session.ts`.  
**Stale claims:** The comparison is intentionally conceptual and external-system dependent. Statements such as “ZITADEL cannot store permission entities today” should be rechecked if the IdP or product model changes, but no repository contradiction was found.  
**Disposition:** Leave as reference; update only when the IdP decision or cache model changes.

## 8. `docs/2026-07-27/PERMISSIONS-IMPLEMENTATION-PLAN.md`

**Classification:** stale-needs-correction.  
**Implementation status:** Slices described as future/active have substantially shipped: permission constants/expansion, guards, session permissions, document guards, and Keto document scope are present. Evidence: `packages/auth/src/permissions.ts`, `packages/server/src/domains/auth/guards.ts`, `packages/server/src/domains/auth/routes/session.ts`, `packages/server/src/domains/documents/api-permissions.test.ts`, `packages/server/src/domains/auth/adapters/keto/authorization.ts`, and `packages/workers/src/auth.ts`.  
**Stale claims:** The header still says “Active — coding checklist”; Slice 1 is marked done but Slices 2–4 are not given current completion status, despite current implementation. The plan’s “current validation” is therefore misleading.  
**Disposition:** Correct slice statuses and replace completed tasks with links to current tests; retain later-slice design items.

## 9. `docs/2026-07-27/PERMISSIONS-MASTER-PLAN.md`

**Classification:** stale-needs-correction.  
**Implementation status:** The canonical permission/role/tuple model is broadly reflected in current code, including permission guards, session permissions, and Keto checks. Evidence: `packages/auth/src/permissions.ts`, `packages/server/src/domains/auth/guards.ts`, `packages/server/src/domains/auth/adapters/keto/authorization.ts`, `packages/server/src/domains/documents/api-permissions.test.ts`, and `docs/2026-08-03/ROLES-AND-SCOPE.md`.  
**Stale claims:** The “Current code vs target” table says authorization is coarse `teamRoles` JSON and documents have no permission checks, while current guards and tests show the target is implemented. Some examples still describe tuples as future even though Keto authorization code is present.  
**Disposition:** Correct the current-vs-target table and explicitly label implemented Keto scope versus remaining product scope; leave the model and later design sections.

## 10. `docs/2026-07-30/ADMIN-PREVIEW-AND-FLAGS-SCOPE.md`

**Classification:** design-reference.  
**Implementation status:** Type A flags/live UI are implemented; `previewSegment` and the proposed admin preview flow are not present in `packages/client/src` (search found no implementation). Segment/layout metadata and resolution are present in `packages/server/src/domains/edge/service.ts`, `packages/server/src/domains/documents/services/layout-helpers.ts`, and `packages/seeding/src/profiles/platform/index.ts`.  
**Stale claims:** “What we shipped” is a dated 2026-07-27 snapshot; “not implemented yet” is accurate for preview.  
**Disposition:** Leave as a decision/reference document; update only when preview ships.

## 11. `docs/2026-07-30/AUTH-DOCUMENTS-TENANT-BOUNDARY-FIX.md`

**Classification:** current.  
**Implementation status:** Cross-domain barrel boundaries and the documents-owned contracts are present; the listed focused tests exist. Evidence: `packages/server/src/domains/documents/index.ts`, `packages/server/src/domains/documents/contracts.ts`, `packages/server/src/domains/auth/index.ts`, `packages/server/src/domains/auth/account-flows.test.ts`, `packages/server/src/domains/auth/idp-registry.test.ts`, `packages/server/src/domains/documents/refs/resolve.test.ts`, and `packages/server/src/domains/documents/content-types/auth-provider/runtime.test.ts`.  
**Stale claims:** None material; “documents/service split separate PR” remains a scoped non-goal.  
**Disposition:** Leave.

## 12. `docs/2026-07-30/CODEBASE-AUDIT-CLEANUP.md`

**Classification:** stale-needs-correction.  
**Implementation status:** Its open list is a dated audit backlog, but several entries are contradicted by the later 2026-07-31 architecture audit and current source. Evidence: `docs/2026-07-31/ARCHITECTURE-AUDIT.md`, `packages/auth/src/fetch-with-timeout.ts`, `packages/client/src/platform/use-app-page-loader.ts`, and `packages/client/src/admin`.  
**Stale claims:** The document lists client admin read bypass and other cleanup as open while the architecture audit marks those fixes complete; it also says stale banners are open without identifying this document’s own superseded status.  
**Disposition:** Correct by marking resolved items or explicitly freezing the file as a historical backlog; do not present it as the current open-issues source.

## 13. `docs/2026-07-31/ARCHITECTURE-AUDIT.md`

**Classification:** current.  
**Implementation status:** Package boundaries, route splits, catalog action patterns, shared contracts, event styles, and consolidated timeout helper match current source. Evidence: `packages/auth/src/index.ts`, `packages/documents/src/index.ts`, `packages/shared/src/index.ts`, `packages/client/src/admin/registry.ts`, `packages/client/src/platform/use-app-page-loader.ts`, `packages/server/src/shared/error-handler.ts`, and `packages/auth/src/fetch-with-timeout.ts`.  
**Stale claims:** The audit is date-scoped and some “P2” wording is necessarily a snapshot; no material contradiction was found within the repository.  
**Disposition:** Leave, with its date/status banner.

## 14. `docs/2026-07-31/ARCHITECTURE-PATTERNS.md`

**Classification:** stale-needs-correction.  
**Implementation status:** The completed sprint list is supported by current package/source structure and history. Evidence: `packages/client/src/admin/registry.ts`, `packages/server/src/domains/*/routes`, `packages/documents/src`, `packages/shared/src`, and git commits `097365c`, `7842f19`, `020feda`, `522a2cd`.  
**Stale claims:** “Open inconsistencies” still lists admin read bypass, permission drift, and duplicate schema issues, although the completed audit says those are fixed.  
**Disposition:** Remove or mark resolved rows and distinguish the historical pre-sprint audit from current defer items.

## 15. `docs/2026-07-31/CATALOG-PROPS-MIGRATION.md`

**Classification:** current.  
**Implementation status:** Catalog schemas/components and seed helpers use nested `config`/`labels`; evidence: `packages/client/src/schemas/shared.ts`, `packages/client/src/core/catalog-schemas.ts`, `packages/client/src/admin/schemas/components.ts`, `packages/client/src/core/components.tsx`, and `packages/seeding/src/profiles/platform/index.ts`.  
**Stale claims:** “All platform catalog components” is broad, but no contradictory flat-root implementation was found in the inspected catalog/schema paths. Reseeding remains an operational requirement for published DB layouts.  
**Disposition:** Leave; update only when the public props contract changes.

## 16. `docs/2026-07-31/DOMAIN-CLEANUP-AUDIT.md`

**Classification:** current.  
**Implementation status:** Open items are framed as deferred cleanup, and the referenced error/shared-package conventions and current source support that framing. Evidence: `packages/server/src/domains/auth/api.ts`, `packages/server/src/domains/tenant`, `packages/client/src/auth/account-flows.ts`, `packages/shared/src/store-slug.ts`, and `docs/2026-07-31/ERROR-HANDLING.md` / `SHARED-PACKAGES.md`.  
**Stale claims:** None material; it is explicitly an open-issues snapshot.  
**Disposition:** Leave, or archive only when each listed item is resolved.

## 17. `docs/2026-07-31/ERROR-HANDLING.md`

**Classification:** current.  
**Implementation status:** Typed domain errors, centralized `app.onError`, `parseBody`, response helpers, permission guards, and shared timeout helper exist. Evidence: `packages/server/src/shared/domain-error.ts`, `packages/server/src/shared/error-handler.ts`, `packages/server/src/bootstrap.ts`, `packages/server/src/shared/parse-body.ts`, `packages/server/src/shared/respond.ts`, and `packages/auth/src/fetch-with-timeout.ts`.  
**Stale claims:** “Route handlers do not catch these” is a convention rather than a guarantee; auth still has route-level parsing/catch patterns noted by the audit. This is not a material contradiction because the document says “service/domain” and “prefer.”  
**Disposition:** Leave as the current convention; clarify “all” versus “preferred” if enforcement is desired.

## 18. `docs/2026-07-31/LAYOUT-COMPOSITION.md`

**Classification:** stale-needs-correction.  
**Implementation status:** `renderAs`/`shellRef`, server shell composition, panel validation, seed metadata, and client composition are implemented. Evidence: `packages/server/src/domains/edge/service.ts`, `packages/server/src/domains/documents/services/layout-helpers.ts`, `packages/client/src/platform/use-app-page-loader.ts`, `packages/client/src/platform/admin-platform-view.tsx`, and `packages/seeding/src/profiles/platform/index.ts`.  
**Stale/contradictory claims:** The status says implemented, but the follow-up P1/P2 repeats adding metadata, edge composition, and removing hardcoded shell behavior as future work. The current implementation also supports `renderAs: "editor"`, omitted from the “three values” claim.  
**Disposition:** Correct the decision/current implementation and mark completed follow-ups; document `editor` as an existing fourth internal mode or explain its scope.

## 19. `docs/2026-07-31/LOCAL-SMOKE-TEST.md`

**Classification:** historical.  
**Implementation status:** This is explicitly a 2026-07-31 run result. Its infrastructure commands and checks describe that environment; current source still has the referenced health endpoints, edge schema path, Keto checks, and admin routes. Evidence: `packages/workers/src/routes/resolve-proxy-org.test.ts`, `packages/workers/src/jwks-cache.test.ts`, `packages/server/src/domains/auth/adapters/keto`, and current seeding/profile code.  
**Stale claims:** PASS counts and running-process instructions are not current verification; they should not substitute for a new smoke run.  
**Disposition:** Leave as historical; add a supersession/current-run pointer if operationally reused.

## 20. `docs/2026-07-31/SHARED-PACKAGES.md`

**Classification:** current.  
**Implementation status:** The three package boundaries and export roles match manifests and source: `packages/auth/package.json`, `packages/documents/package.json`, `packages/shared/package.json`, their `src/index.ts` files, and package READMEs. Current consumers are visible in `packages/server`, `packages/client`, and `packages/workers`.  
**Stale claims:** None material; “not yet in workers” for documents is an explicit scope statement and should be revisited only when edge CMS parsing is added.  
**Disposition:** Leave.

## 21. `docs/2026-07-31/SMOKE-TEST-FIXES.md`

**Classification:** historical.  
**Implementation status:** The listed fixes are reflected in current source/tests: path/host/JWT org resolution, proxy origin behavior, workspace SWC includes, seed schema repair, route clarification, and discovery-based JWKS resolution. Evidence: `packages/workers/src/routes/resolve-proxy-org.ts`, `packages/workers/src/routes/resolve-proxy-org.test.ts`, `packages/client/rspack.config.mjs`, `packages/seeding/src/profiles/platform/index.ts`, `packages/workers/src/jwks-cache.ts`, and `packages/workers/src/jwks-cache.test.ts`.  
**Stale claims:** Symptoms and restart instructions describe the 2026-07-31 incident; they are not proof that a present deployment is healthy.  
**Disposition:** Leave as a historical fix record; do not rewrite incident symptoms as current status.

## Overall findings

- **Current:** 7 documents (4, 11, 13, 15, 16, 17, 20).
- **Historical:** 3 documents (2, 19, 21).
- **Design-reference:** 3 documents (5, 7, 10).
- **Stale-needs-correction:** 8 documents (1, 3, 6, 8, 9, 12, 14, 18).
- **Unclear:** 0.

**Total: 21 documents.** No assigned document was omitted.
