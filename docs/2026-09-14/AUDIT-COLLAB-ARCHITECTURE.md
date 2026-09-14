# Markdown audit: collaboration architecture and adjacent status records

**Audit date:** 2026-09-14  
**Assigned scope:** `docs/2026-08-06/*.md` and `docs/2026-08-07/*.md` only.  
**Documents audited:** 33 (22 in 2026-08-06; 11 in 2026-08-07).

## Method and current-repository anchors

Every assigned Markdown file was read in full. Claims were compared with current source, tests, package manifests, seed/profile files, and relevant history. The most important history is `72b3a59` (2026-08-07, Redis collab relay), `571ec3d` (2026-08-07, separate worker runtime), `ad2b9f4`/`570a52f`/`b7462d0` (2026-08-06 collab/rich-text implementation), `1a3bed5` (2026-09-05 stale chunk overwrite fix), and the current documentation corrections `c28b897`/`d983a9d` (2026-09-14).

Current implementation anchors used repeatedly below:

- Layout collab: `packages/client/src/editor/collab/layout-collab-repo.ts`, `use-layout-collab.ts`, `platform/persistence/automerge-indexeddb.ts`; server `packages/server/src/domains/collab/layout-room.ts`, `repo-network-hub.ts`, `collab-automerge-chunk-store.ts`, `schema.ts`.
- Rich text: `packages/client/src/components/rich-text/RichTextTipTapEditor.tsx`, `use-rich-text-collab.ts`; server `packages/server/src/domains/collab/richtext-yjs-room.ts`, `agent/collab/agent-richtext-yjs-editor.ts`; renderer/HTML paths in `packages/extensions/src/shared/RichTextRenderer.tsx` and `packages/documents/src/richtext-html.ts`.
- Cross-replica collab: `packages/server/src/domains/collab/collab-redis-relay.ts`, its tests, and imports from both room managers; entrypoint wiring in `packages/server/src/index.ts` and `worker.ts`.
- Worker separation and Redis health: `packages/server/src/bootstrap.ts`, `worker.ts`, `shared/worker-runtime.ts`, `shared/redis-fanout-status.ts`.
- Current route/event evidence: `packages/client/src/platform-routes.ts:152-155`, `packages/seeding/src/profiles/platform/index.ts:299`, and `packages/server/src/domain-events.ts:14-33`.

Classification means: **current** = usable operational/current guidance; **historical** = accurate dated record, not current status; **design-reference** = proposal or external pattern reference; **stale-needs-correction** = contains claims that should be corrected before being used as current; **unclear** = evidence is insufficient or internally conflicting.

---

## 1. `docs/2026-08-06/AGENT-CHAT-OBSERVABILITY.md`

**Classification:** current (with a dated caveat).  **Implementation status:** The editor submits orchestrate tasks and polls; API-process BullMQ worker, task routes/storage, executor, collab sessions, OTEL, and Admin task view all exist. The documented raw-error/polling limitations remain relevant.  **Evidence:** `packages/client/src/editor/hooks/use-editor-agent-panel.ts`; `packages/client/src/editor/components/agent/AgentPanel.tsx`; `packages/server/src/domains/agent/routes/tasks.ts`, `service.ts`, `worker.ts`, `mastra/executor.ts`, `collab/agent-layout-collab-session.ts`; `packages/server/src/tracing.ts`; `packages/client/src/admin/components/agents/AgentsAdminForm.tsx`.  **Stale claims:** The “as of 2026-08-06” gap list and exact polling/port/default values are a snapshot and should be rechecked; it does not cover later worker separation or Redis health.  **Disposition:** leave as an operational guide; add a clear snapshot date and link to newer status rather than presenting its gap list as authoritative.

## 2. `docs/2026-08-06/BUILD-MASTER-INDEX.md`

**Classification:** stale-needs-correction.  **Implementation status:** Useful backlog/index, but its platform snapshot is no longer current. Code supports E3, E3e sessions/tools, R1/D7, and I1/I2 paths; Redis relay and worker split landed after the snapshot.  **Evidence:** collab and rich-text anchors above; `packages/server/src/domains/agent/mastra/tools/patch-layout-draft.ts`; `packages/workers/src/routes/{bot-ssr.ts,storefront.ts,static.ts}`; `scripts/deploy/client-r2.ts`; `packages/seeding/src/profiles/platform/index.ts`; `docs/2026-08-07/ACTION-PLAN.md`.  **Stale claims:** Contradictory C2 shipped/deferred rows; E3e still described as a spec/open item; I1/I2 called shipped while this file’s linked runbook retains unchecked deployment smoke; R1/D7 status conflicts with the old RICH-TEXT implementation narrative; O3 differs from later status.  **Disposition:** correct statuses and mark the date-folder snapshot explicitly historical, or replace it with a link to an authoritative current roadmap.

## 3. `docs/2026-08-06/CLIENT-INDEXEDDB-PERSISTENCE.md`

**Classification:** current.  **Implementation status:** Correctly describes IndexedDB as collab-only: Automerge layout storage uses the platform factory and rich text uses `y-indexeddb`; it is not a general offline/admin/auth store and Postgres JSON remains publish truth.  **Evidence:** `packages/client/src/platform/persistence/automerge-indexeddb.ts`; `packages/client/src/editor/collab/layout-collab-repo.ts`; `packages/client/src/components/rich-text/use-rich-text-collab.ts`; `packages/server/src/domains/collab/layout-room.ts`; `packages/server/src/domains/collab/richtext-yjs-room.ts`.  **Stale claims:** It predates Redis cross-replica relay and does not state that rich-text room hydration/manual cross-replica smoke remain gaps.  **Disposition:** leave; optionally add the relay/hydration caveat.

## 4. `docs/2026-08-06/COLLAB-BLOB-STORAGE.md`

**Classification:** current.  **Implementation status:** Three-layer model is accurate: Postgres JSON publish snapshot, Automerge server chunks in Postgres or env-gated R2, and client IndexedDB cache.  **Evidence:** `packages/server/src/domains/collab/collab-automerge-chunk-store.ts`, `r2-automerge-chunk-store.ts`, `postgres-automerge-storage.ts`, `schema.ts`, `layout-room.ts`; client persistence files above.  **Stale claims:** No production R2/deployment proof is supplied; it describes single-process room behavior from the snapshot era and omits the later Redis relay.  **Disposition:** leave as architecture reference, but distinguish implemented adapters from deployed/verified production storage and mention relay separately.

## 5. `docs/2026-08-06/COLLAB-FEATURE-INVENTORY.md`

**Classification:** stale-needs-correction.  **Implementation status:** Most feature rows match code: layout Automerge, presence, client IDB, Yjs/TipTap, agent sessions, edge WS, and HTTP cold path are implemented.  **Evidence:** `packages/client/src/editor/hooks/use-edit-page-orchestration.ts`; `packages/server/src/domains/collab/{layout-room.ts,richtext-yjs-room.ts,routes.ts}`; agent collab/tool files; `packages/workers/src/routes/proxy-websocket.ts`; `packages/server/src/domains/collab/collab-redis-relay.ts`.  **Stale claims:** “Single-process room only,” “Redis not live,” and the all-open E3e/D7 verification tables are Aug-6 claims; Redis relay landed in `72b3a59`, while manual browser acceptance (cross-replica, agent rich-text, two-tab rich text) remains open.  **Disposition:** retain as dated inventory only after updating implementation-vs-smoke columns and replacing single-process claims with current relay/degraded-mode behavior.

## 6. `docs/2026-08-06/COLLAB-LOCAL-SMOKE-RESULTS.md`

**Classification:** historical.  **Implementation status:** Valid record of the 2026-08-06 local run: steps 1–6 and edge path passed, simultaneous two-user step 7 and several deferred scenarios were not run.  **Evidence:** the recorded test command and results; current collab unit tests under `packages/client/src/editor/collab` and `packages/server/src/domains/collab`; edge proxy `packages/workers/src/routes/proxy-websocket.ts`.  **Stale claims:** Results and credentials/layout IDs are not current environment guarantees; it predates Redis relay and later stale-chunk fixes.  **Disposition:** leave immutable as dated evidence; add a frozen-snapshot banner if it is used as a status reference.

## 7. `docs/2026-08-06/COLLAB-PROD-SMOKE.md`

**Classification:** current (design/runbook, not evidence).  **Implementation status:** Checklist correctly describes intended deployed layout/rich-text/agent tests and worker-origin WS path; multi-API Redis/Hocuspocus items are explicit deferred test targets, not claimed passes.  **Evidence:** `packages/workers/src/routes/proxy-websocket.ts`; collab routes/tickets and both room managers; `docs/2026-08-07/RICHTEXT-YJS-REWRITE-VERIFICATION.md`.  **Stale claims:** It does not reflect that Redis relay is now implemented, and its checklist must not be cited as completed smoke.  **Disposition:** leave as a procedural runbook; add relay checks and explicit “not run” status.

## 8. `docs/2026-08-06/COLLAB-SYNC-INCIDENT-FIXES.md`

**Classification:** historical.  **Implementation status:** Root causes and fixes (per-recipient presence, `handle.change()` for outbound local edits, pending queue, agent-task push, no agent virtual pointer, server-room-side agent apply) match current code.  **Evidence:** `packages/server/src/domains/collab/{presence.ts,layout-room.ts}`; `packages/client/src/editor/collab/{use-layout-collab.ts,automerge-spec.ts}`; `packages/server/src/domains/agent/{collab/agent-layout-collab-session.ts,mastra/tools/patch-layout-draft.ts}`; `packages/client/src/editor/components/canvas/CollabRemoteCursors.tsx`.  **Stale claims:** It is not the complete incident history: E3e records a 2026-08-07 hybrid/ephemeral-Repo follow-up, and later `1a3bed5` fixed stale chunk overwrite.  **Disposition:** leave as immutable incident record and cross-link the later follow-up; do not use as a complete current status.

## 9. `docs/2026-08-06/E3-AUTOMERGE-REPO.md`

**Classification:** current.  **Implementation status:** Repo/network adapter, CBOR routing, presence text frames, IndexedDB, server chunk persistence, and the `change` versus `update` rule remain accurate.  **Evidence:** `packages/client/src/editor/collab/layout-collab-repo.ts`, `layout-collab-ws-adapter.ts`, `platform/persistence/automerge-indexeddb.ts`; `packages/server/src/domains/collab/{layout-room.ts,repo-network-hub.ts}`.  **Stale claims:** “S3/R2 optional later” is too weak because an R2 adapter exists; “dogfood” and single-process framing are dated after Redis relay.  **Disposition:** leave as implementation guide after correcting R2 and horizontal-scaling wording.

## 10. `docs/2026-08-06/E3-LIVE-CRDT-COLLAB-IMPLEMENTATION.md`

**Classification:** stale-needs-correction.  **Implementation status:** Core layout architecture and most code map are useful; E3a, presence, automerge-repo, durable blobs, and D7/Yjs are implemented.  **Evidence:** current layout/rich-text anchors; `packages/server/src/domains/collab/routes.ts`; `packages/workers/src/routes/proxy-websocket.ts`; `packages/client/src/components/rich-text/use-rich-text-collab.ts`.  **Stale claims:** Early sections still present Automerge/Loro as unresolved, call D7 optional/deferred, describe old acceptance/build slices, and say “canvas pointer cursors” without the agent-specific removal; Redis relay is absent.  **Disposition:** correct shipped/gap sections and move the old strategy/build plan into a historical section, or mark the whole document historical.

## 11. `docs/2026-08-06/E3-SPIKE-HANDOFF.md`

**Classification:** historical/design-reference.  **Implementation status:** Accurately records the mission and prerequisites of the completed offline Automerge-vs-Loro spike.  **Evidence:** `E3-SPIKE-REPORT.md`; current adapter under `packages/server/src/domains/collab`; `packages/client/src/editor/hooks/use-edit-page-orchestration.ts`.  **Stale claims:** `?collab=1`, old E3a status, and pre-implementation “out of scope” statements are not current.  **Disposition:** leave as archived handoff with a historical banner; do not correct it into a current build guide.

## 12. `docs/2026-08-06/E3-SPIKE-REPORT.md`

**Classification:** historical.  **Implementation status:** Recorded benchmark/results and Automerge-primary recommendation remain valid as an experiment.  **Evidence:** report’s fixtures/results; current Automerge implementation in `packages/server/src/domains/collab` and client repo files.  **Stale claims:** E3a `?collab=1`, manual relay, R1 not started, and D7 deferred are false as current status; current edit mode is always-on and rich text is implemented.  **Disposition:** preserve as experiment record, add “results captured 2026-08-06; not current status.”

## 13. `docs/2026-08-06/E3e-AGENT-COLLAB-REFERENCES.md`

**Classification:** design-reference.  **Implementation status:** External patterns are intentionally reference material; the current product uses a real agent WS peer, selection outline, and Yjs awareness.  **Evidence:** `packages/server/src/domains/agent/collab/{agent-layout-collab-session.ts,agent-richtext-collab-session.ts}`; `packages/client/src/editor/components/canvas/CollabRemoteCursors.tsx`; `E3e-AGENT-FULL-COLLAB-PEER.md`.  **Stale claims:** The “our implementation” mapping still names `virtualPointerForElement` and agent cursor coordinates, but `virtual-pointer.ts` was removed and agents are selection-outline-only.  **Disposition:** retain as design research; correct the mapping or label it explicitly as pre-ship research.

## 14. `docs/2026-08-06/E3e-AGENT-FULL-COLLAB-PEER.md`

**Classification:** stale-needs-correction.  **Implementation status:** Architecture and much of the product contract are implemented: agent layout/rich-text sessions, server-room apply, ticket refresh, presence, selection outline, audit path, and cold HTTP path.  **Evidence:** `packages/server/src/domains/agent/collab/*`; `packages/server/src/domains/agent/mastra/tools/patch-layout-draft.ts`; client presence/canvas files; `packages/server/src/domains/collab/collab-ticket-refresh.ts`.  **Stale claims:** Acceptance checklist remains entirely unchecked; “new modules” and estimate are historical; ticket `agentSlug` is described as future despite landed presence metadata; 2026-08-07 hybrid/ephemeral-Repo incident and current manual gaps need incorporation.  **Disposition:** keep as canonical design only after separating shipped, automated, and manual-unverified criteria and adding the follow-up incident.

## 15. `docs/2026-08-06/LITELLM-LOCAL-ORCHESTRATE.md`

**Classification:** current.  **Implementation status:** Base URL, local `sk-local` behavior, provider/model normalization, environment variables, and planner references match server code and tests.  **Evidence:** `packages/server/src/domains/agent/mastra/{llm-env.ts,llm-env.test.ts,resolve-planner-model.ts,resolve-planner-model.test.ts,executor.ts}`; `packages/server/package.json`.  **Stale claims:** The `file:///Users/sebastt/Downloads/aiplayground` path is machine-specific and external; it is not portable setup.  **Disposition:** leave as local operational guide; add a portability note and avoid treating a local proxy as repository infrastructure.

## 16. `docs/2026-08-06/MASTER-STATUS.md`

**Classification:** stale-needs-correction (severe).  **Implementation status:** It is an Aug-6 test/status snapshot; current code has collab, rich text, blobs, event sources, Redis relay, worker separation, and later tests/fixes.  **Evidence:** current anchors above; `packages/server/src/domain-events.ts`; `packages/server/src/index.ts`; `worker.ts`; `docs/2026-08-07/ACTION-PLAN.md`; newer `docs/2026-08-22/BROWSER-AGENT-COLLAB-SMOKE-RESULTS.md`.  **Stale claims:** 316 tests/60-of-60 header; Deferred table incorrectly lists C2, E3c/D7, and optional blobs despite implementation; I1/I2 and E3 are called shipped without deployment smoke evidence; rows conflict with `REMAINING-WORK-RUNBOOK.md`.  **Disposition:** freeze as historical or replace with an updated authoritative status; do not leave it labeled current.

## 17. `docs/2026-08-06/README.md`

**Classification:** stale-needs-correction.  **Implementation status:** The index accurately identifies useful Aug-6 docs, but its “start here/current status” wording is no longer true.  **Evidence:** all linked status docs plus `docs/2026-08-22` and `docs/2026-09-14` current roadmap/status records.  **Stale claims:** It points readers to obsolete MASTER-STATUS/remaining-work snapshots and omits later verification/current roadmap context.  **Disposition:** retain as historical index with a superseded banner and links to current status, or correct the entry point.

## 18. `docs/2026-08-06/RICH-TEXT-IMPLEMENTATION.md`

**Classification:** stale-needs-correction.  **Implementation status:** Header says shipped and the checklist contains landed R1/R1.3 work, but the executive/current-state section and final note still say all client paths are missing. Current client/admin/renderer/search/email/Yjs code exists.  **Evidence:** `packages/client/src/components/{rich-text,content}/`; `packages/documents/src/{richtext.ts,richtext-html.ts,content-search.ts}`; `packages/extensions/src/shared/RichTextRenderer.tsx`; server rich-text/Yjs files and tests.  **Stale claims:** Lines 13–38 and final “all client paths missing” contradict the implementation; D7 is described as future despite code.  **Disposition:** correct current-state and done criteria; preserve the original plan/checklist as a dated implementation history if needed.

## 19. `docs/2026-08-06/RICH-TEXT-LIVE-TESTING.md`

**Classification:** historical.  **Implementation status:** Records browser/API errors and fixes that correspond to current TipTap/Yjs, auth, seed, renderer, and search code.  **Evidence:** `packages/client/src/components/rich-text/{RichTextTipTapEditor.tsx,use-rich-text-collab.ts,y-tiptap-collaboration-cursor.ts}`; `packages/server/src/domains/agent/collab/agent-richtext-yjs-editor.ts`; `packages/workers/src/routes/{bot-ssr.ts,storefront.ts}`; commerce seed profile.  **Stale claims:** Credentials, seed commands, browser results, and “status after fixes” are dated smoke evidence, not a current guarantee.  **Disposition:** leave immutable as historical test evidence and date/freeze it clearly.

## 20. `docs/2026-08-06/RICH-TEXT-PARITY.md`

**Classification:** stale-needs-correction.  **Implementation status:** R1–R1.3 feature rows largely match current renderer, embeds, constraints, email, search, and tests.  **Evidence:** `packages/extensions/src/shared/RichTextRenderer.tsx`; `packages/documents/src/{richtext.ts,content-search.ts}`; client TipTap files; related tests.  **Stale claims:** RT-9 says D7 is deferred/absent, contradicted by `use-rich-text-collab.ts`, Yjs room/session code, and the live-testing record; smoke coverage remains incomplete even though code exists.  **Disposition:** update D7 to implemented/dev-only or partially verified, clearly separating code status from manual acceptance.

## 21. `docs/2026-08-06/STOREFRONT-PROD-I1-I2-RUNBOOK.md`

**Classification:** stale-needs-correction.  **Implementation status:** Bot SSR, storefront routing/static R2 serving, and client deploy script exist.  **Evidence:** `packages/workers/src/routes/{bot-ssr.ts,storefront.ts,static.ts}`; `packages/workers/src/index.ts`; `scripts/deploy/client-r2.ts`; package scripts; `packages/seeding` profiles.  **Stale claims:** Top-level status docs call I1/I2 shipped while this runbook retains unchecked I1.5/I2.6 and says empty R2/not-routed blocks production. Code existence is not deployment smoke evidence.  **Disposition:** retain as runbook but explicitly separate implemented code, local verification, and production deployment status; reconcile with current roadmap.

## 22. `docs/2026-08-06/REMAINING-WORK-RUNBOOK.md`

**Classification:** stale-needs-correction.  **Implementation status:** It contains useful A3/V4/K1/K2 runbook material, but it is no longer a coherent Aug-6 snapshot.  **Evidence:** current agent executor/env/tests; `packages/server/src/domains/collab`; `docs/2026-08-22/BROWSER-AGENT-COLLAB-SMOKE-RESULTS.md`; current status/roadmap docs.  **Stale claims:** It embeds 2026-08-22 checks inside an Aug-6 document, says V4 is the only gate while checkboxes remain open, and lists C2/O1–O2/I1–I2 as deferred despite later implementation/status; E3e remains “spec.”  **Disposition:** split dated historical results from live backlog, then correct statuses; otherwise mark the whole file historical.

## 23. `docs/2026-08-07/README.md`

**Classification:** historical (audit index).  **Implementation status:** The architecture themes remain useful, but its top-line metrics and file inventory are stale.  **Evidence:** current `domain-events.ts`, `platform-routes.ts`, machines tests/schema, client memo uses, collab relay, worker runtime, and `RICHTEXT-YJS-REWRITE-VERIFICATION.md`.  **Stale claims:** Event registry/traces bug, zero `React.memo`, old typecheck failure, zero machines tests, process-local collab, and omission of the rewrite-verification file; current docs also supersede its self-described “fresh” status.  **Disposition:** retain only as dated audit index; correct or supersede metrics before presenting it as current.

## 24. `docs/2026-08-07/ARCHITECTURE.md`

**Classification:** stale-needs-correction.  **Implementation status:** Manual domain wiring, cross-domain coupling, god files, editor/admin imports, and registry casts remain useful findings.  **Evidence:** `packages/server/src/bootstrap.ts`/domain factories; `packages/client/src/editor/content-fields.ts`; `packages/client/src/platform/registry.ts:12`; `packages/client/src/editor/registry.ts:44`; current source line counts.  **Stale claims:** Event registry drift is fixed (`packages/server/src/domain-events.ts:14-33`); traces route bug is fixed (`platform-routes.ts:152-155`, seed profile); exact line counts and context descriptions have drifted.  **Disposition:** preserve valid structural findings, remove fixed incidents, and refresh every metric/evidence range.

## 25. `docs/2026-08-07/EFFICIENCY-PERFORMANCE.md`

**Classification:** stale-needs-correction.  **Implementation status:** Synchronous analytics `gzipSync`, JSONB text-cast search, wide editor context, JSON serialization/equality hot paths, no virtualization, duplicate navigation requests, and limited code splitting remain relevant.  **Evidence:** `packages/server/src/domains/analytics/routes/ingest.ts`; `packages/server/src/domains/documents/adapters/postgres.ts`; client editor hooks; `packages/client/src/editor/components/palette/ComponentPalette.tsx` and `LayerTreePanel.tsx`.  **Stale claims:** “Zero React.memo” is false (current palette and layer-tree memo uses); exact line/dependency counts need refresh; distinguish equality checks from intentional cloning/serialization.  **Disposition:** correct memo claim and metrics, retain remaining performance findings.

## 26. `docs/2026-08-07/EXPANDABILITY.md`

**Classification:** stale-needs-correction.  **Implementation status:** New domains/panels still require multiple manual registrations; field input remains an if-chain; vendor/storage coupling and hard-coded integration query branches remain.  **Evidence:** `packages/server/src/bootstrap.ts`, `drizzle.config.ts`, `drizzle.ts`, `domain-events.ts`; `packages/client/src/platform-routes.ts`, `auth/admin-routes.ts`, admin registry/schemas; content field input; auth/provider and storage adapters.  **Stale claims:** The traces mismatch example is fixed; exact touch-point counts/line numbers and “~7 types” need refresh; provider-registry assertions should be rechecked against current auth/content-type provider code.  **Disposition:** retain the structural audit after deleting the fixed traces incident and refreshing provider/count evidence.

## 27. `docs/2026-08-07/JSON-RENDER-REFERENCE-PATTERNS.md`

**Classification:** design-reference.  **Implementation status:** Local observations remain substantially useful: client does not use `diffToPatches`/the upstream split providers, and registry casts remain.  **Evidence:** `packages/client/src/editor/collab/automerge-spec.ts`, `use-layout-collab.ts`, `use-content-draft.ts`; `packages/client/src/platform/registry.ts`; `packages/client/src/editor/registry.ts`; installed package manifests.  **Stale claims:** External upstream claims are version/date-sensitive and should be pinned/rechecked; the document’s config/labels implication conflicts with the live flat-props skill (`skills/spec-driven-ui/SKILL.md:24`); line references drift.  **Disposition:** leave as advisory comparison, label external evidence/version, and correct local contract wording.

## 28. `docs/2026-08-07/MAINTAINABILITY.md`

**Classification:** stale-needs-correction.  **Implementation status:** Coverage gaps, absent thresholds, thin client/extensions/browser-sdk tests, raw throws, CI/build gaps, and several duplication concerns remain.  **Evidence:** `vitest.config.ts`; package manifests; current test files; `packages/server/src/shared/hmac.contract.test.ts`; `packages/client/src/platform/registry.ts`; current server error sites.  **Stale claims:** Root typecheck failure is contradicted by the rewrite verification and current tree; HMAC duplication is fixed by the contract test; machines now has tests; ratios/line counts/throw counts need refresh.  **Disposition:** update metrics and mark fixed typecheck/HMAC/machines claims; retain unresolved coverage, thresholds, CI, raw-error, and secrets-pipeline items.

## 29. `docs/2026-08-07/RICHTEXT-YJS-REWRITE-VERIFICATION.md`

**Classification:** historical verification record.  **Implementation status:** Headless server Yjs rewrite, dependency cleanup, Redis relay, worker entrypoint, and targeted tests are present; manual checks remain intentionally open.  **Evidence:** `packages/server/src/domains/agent/collab/agent-richtext-yjs-editor.ts`; `packages/server/package.json`; `packages/server/src/domains/collab/{collab-redis-relay.ts,richtext-yjs-room.ts}` and tests; `packages/server/src/worker.ts`.  **Stale claims:** Automated results are run-at-date claims, not independently rerun in this audit; layout relay still lacks a relay-specific test; real two-replica browser smoke, Redis-down end-to-end, agent rich-text E2E, and rich-text room Postgres hydration remain open (`richtext-yjs-room.ts` creates a blank room doc).  **Disposition:** leave as dated verification record; keep manual checklist and do not convert boxes without fresh logs.

## 30. `docs/2026-08-07/SCALABILITY.md`

**Classification:** stale-needs-correction.  **Implementation status:** JSONB search/text-cast, incomplete DB-level pagination, no list virtualization, and some process-local caches remain concerns.  **Evidence:** `packages/server/src/domains/documents/adapters/postgres.ts`; machines routes/schema; client layer/admin list components; `packages/server/src/domains/collab/collab-redis-relay.ts`; `shared/redis-fanout-status.ts`; `bootstrap.ts`/`worker.ts`; `shared/concurrency.ts`; flags evaluation.  **Stale claims:** Collab is no longer process-local-only; Redis relay/health monitoring and worker separation landed in `72b3a59`/`571ec3d`; several N+1s are fixed; machine indexes exist (`packages/server/src/domains/machines/schema.ts:58,78`).  **Disposition:** rewrite the single-instance and “done” sections, retain remaining query/client/load findings with current evidence.

## 31. `docs/2026-08-07/SKILL-REWRITE-PROPOSAL.md`

**Classification:** historical/design-reference.  **Implementation status:** The proposal was applied; live `skills/spec-driven-ui/SKILL.md` and `reference.md` contain the host/catalog boundary, persistence layer, editor exception, registry guidance, and checklist.  **Evidence:** live skill/reference files; `docs/2026-08-07/SPEC-DRIVEN-UI-COMPLIANCE.md`; `docs/2026-08-07/ACTION-PLAN.md:89`.  **Stale claims:** It still reads as a proposal/next step, repeatedly uses the old config+labels contract, and says re-verification is next despite completion.  **Disposition:** retain as rationale/decision history; prepend a superseded-by-live-skill banner and correct contract wording only if this record must remain searchable.

## 32. `docs/2026-08-07/SPEC-DRIVEN-UI-COMPLIANCE.md`

**Classification:** stale-needs-correction.  **Implementation status:** Direct catalog-component fetches, editor-to-admin imports, and `as never` registry casts remain; the editor exception is now documented in the live skill.  **Evidence:** `packages/client/src/admin/components/shell/AdminNav.tsx`, `DocumentShareField.tsx`; `packages/client/src/editor/content-fields.ts`; `packages/client/src/platform/registry.ts:12`; `packages/client/src/editor/registry.ts:44`; `skills/spec-driven-ui/SKILL.md` and `reference.md`.  **Stale claims:** Baseline says config+labels while live skill requires flat props; traces route/HMAC/typecheck-era references are fixed; “no enforcement” is broadly true but must be rechecked after current refactors.  **Disposition:** update baseline and remove fixed incidents, retain current violations and actionable enforcement checklist.

## 33. `docs/2026-08-07/ACTION-PLAN.md`

**Classification:** stale-needs-correction.  **Implementation status:** Many done rows are corroborated: typecheck rewrite, traces route/seed, event sources, Redis relay, fanout monitoring, worker split, bounded/parallel/bulk work, HMAC test, and skill rewrite. Remaining items include async gzip, DB pagination, editor context/diff/memo work, coverage/thresholds/build CI, identity port, enforcement, and mount-load cleanup.  **Evidence:** `packages/server/src/{domain-events.ts,index.ts,worker.ts,shared/{redis-fanout-status.ts,concurrency.ts}}`; `packages/server/src/domains/collab/collab-redis-relay.ts`; `packages/server/src/shared/hmac.contract.test.ts`; current skill/reference; unresolved files cited in §§25–32.  **Stale claims:** Duplicate numbering; README says proposal draft while plan says applied; action 24 still frames editor exception documentation as pending; item 25b–25f numbering and completion wording are inconsistent.  **Disposition:** retain as backlog snapshot only after reconciling done/open rows, renumbering, and linking current evidence.

---

## Overall conclusion

The assigned directories contain a mixture of useful current runbooks, valid historical smoke/incident/spike records, design research, and status/audit snapshots that are now stale. The most urgent corrections are `MASTER-STATUS.md`, `BUILD-MASTER-INDEX.md`, `REMAINING-WORK-RUNBOOK.md`, `RICH-TEXT-IMPLEMENTATION.md`, `RICH-TEXT-PARITY.md`, `E3-LIVE-CRDT-COLLAB-IMPLEMENTATION.md`, `SCALABILITY.md`, and `ACTION-PLAN.md`. The most important repository changes that invalidate old claims are Redis-backed cross-replica collab (`72b3a59`), separate worker runtime (`571ec3d`), fixed event/route/HMAC/typecheck findings, later rich-text/agent verification, and current September roadmap work. No existing documentation or source was modified by this audit.
