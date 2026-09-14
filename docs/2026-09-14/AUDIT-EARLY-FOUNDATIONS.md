# Early Foundations Markdown Audit

**Audit scope:** Every Markdown file directly under `docs/2026-05-23`, `docs/2026-07-04`, `docs/2026-07-10`, `docs/2026-07-11`, and `docs/2026-07-13` (and no other documentation directories).

**Repository snapshot audited:** `d983a9d` (`main`). The repository had three pre-existing untracked audit files under `docs/2026-09-14`; they were not changed. No existing documentation or source was modified by this audit.

**Classification meanings:**
- **current** — material accurately describes the current implementation, with only ordinary future-work language.
- **historical** — explicitly records an earlier plan/status/decision and should be retained as history, not treated as current reference.
- **design-reference** — principally an intentional architecture/product proposal; implementation status is not its purpose.
- **stale-needs-correction** — contains present-tense status, paths, package maps, or decisions contradicted by the current tree/history.
- **unclear** — evidence is insufficient or internally contradictory.

Evidence below uses repository paths and, where useful, commit IDs. “Leave/mark historical/correct” is the recommended disposition, not an edit performed by this audit.

## 1. `docs/2026-05-23/README.md`

**Classification:** design-reference.

**Factual implementation status:** Product positioning and architecture overview; it is not an implementation status record. The repository does have the broad JSON/spec, server, client, worker, agent, analytics, flags, and catalog concepts, but not the promised complete commerce/ML product.

**Evidence:** `package.json`; `packages/server/src/domains/`; `packages/client/src/`; `packages/workers/src/`; `packages/browser-sdk/src/`; `docker-compose.yml`; `docs/2026-07-11/STATUS.md`.

**Stale claims:** “one server” replacing seven tools, complete commerce engine, per-visitor AI generation, edge delivery targets, automatic ML retraining, managed-service pricing, and a full working open-source store are product claims not evidenced by current code. The README also presents json-render and the vertical/competitive assertions as settled facts rather than proposals.

**Disposition:** Leave as a product/design reference, but label prominently as vision/non-status if it is used as a repository entry point. Do not use it as an implementation source of truth.

## 2. `docs/2026-05-23/OVERVIEW.md`

**Classification:** design-reference.

**Factual implementation status:** Detailed product journeys and target architecture. Some foundations exist (documents, context, flags, agent, analytics, edge, tenant catalog), but the described Shopify/standalone commerce, ML insights, checkout, and full visual storefront journeys are not a demonstrated end-to-end implementation.

**Evidence:** `packages/server/src/domains/documents/`; `packages/server/src/domains/context/`; `packages/server/src/domains/flags/`; `packages/server/src/domains/agent/`; `packages/server/src/domains/analytics/`; `packages/server/src/domains/edge/`; `packages/server/src/domains/tenant/`; `packages/client/src/main.tsx`; `packages/workers/src/routes/storefront.ts`.

**Stale claims:** “can buy a product,” Stripe/Shopify dual-path operation, automatic bandit/ML loop, live visual editor behavior, and the listed performance/price outcomes are not current repository facts. The architecture diagram also assumes Cloudflare/R2 production behavior while the checked-in deployment is local/dev-oriented.

**Disposition:** Leave as design-reference; correct or annotate any present-tense implementation language before using it as a technical status document.

## 3. `docs/2026-05-23/PRODUCT.md`

**Classification:** design-reference.

**Factual implementation status:** Product principles, feature taxonomy, competitive positioning, revenue model, and phased target roadmap. It is useful as product intent, not a code audit.

**Evidence:** `package.json`; `packages/server/package.json`; `packages/client/package.json`; `packages/server/src/domains/`; `packages/client/src/editor/`; `packages/server/src/domains/machines/`; `packages/server/src/domains/integrations/`.

**Stale claims:** Foundation/Intelligence/Commerce Scale tables describe commerce, Stripe Connect, Shopify, A/B bandits, edge ML, and ML feedback as planned product capabilities; current code has generic domains and evidence plumbing but not that complete commercial stack. Competitive prices, conversion lifts, “same capabilities,” and “no GMV fee” are business hypotheses, not repository facts. The repeated duplicate “2” moat heading is editorially stale.

**Disposition:** Leave as product/design reference. Correct only if this document is intended to claim shipped features; otherwise add a clear “vision/targets” designation.

## 4. `docs/2026-05-23/STACK.md`

**Classification:** stale-needs-correction.

**Factual implementation status:** The repository does use Postgres, Dragonfly/Redis, ClickHouse, Hono, XState, BullMQ, Drizzle, json-render, Rspack/R2-compatible storage, Nango, ZITADEL, and OpenTelemetry-related packages. However, this file is a proposed complete stack and has contradictory build-vs-buy rows.

**Evidence:** `docker-compose.yml`; `packages/server/package.json`; `packages/client/package.json`; `packages/workers/package.json`; `packages/browser-sdk/package.json`; `pnpm-workspace.yaml`; `packages/server/src/domains/`; `packages/server/src/shared/`.

**Stale claims:** It says Logto is the auth service, says the custom editor replaces GrapesJS while also listing GrapesJS as something built, says the client/editor and all phase-0 infrastructure are complete, and contains malformed/incomplete rows (the email row at line 43 and `?` local-development entries). Current auth is ZITADEL plus Ory Keto, not Logto; current package boundaries include more than the described server/client/CLI map.

**Disposition:** Correct. Preserve the original as historical only if a dated snapshot is desired; otherwise replace the technology table and package map from manifests/compose.

## 5. `docs/2026-05-23/TECH.md`

**Classification:** stale-needs-correction.

**Factual implementation status:** It documents a target split API/edge/client architecture and many later-realized concepts. Current source has an API server, edge worker, client bundle, documents/context/flags/tenant domains, HMAC auth, OpenTelemetry, and bot SSR, but not every endpoint, renderer path, commerce adapter, or ML pipeline asserted here.

**Evidence:** `packages/server/src/index.ts`; `packages/server/src/domains/`; `packages/workers/src/renderer.ts`; `packages/workers/src/routes/bot-ssr.ts`; `packages/workers/src/routes/storefront.ts`; `packages/client/src/main.tsx`; `packages/server/src/shared/org.ts`; `packages/server/src/shared/hmac.contract.test.ts`; `packages/server/src/tracing.ts`; commit `1fb334a` (bot HTML streaming) and `98edf4` (edge personalization).

**Stale claims:** The document says the API server has no SSR/React and describes React edge SSR as future-style architecture (some is now true, some is implemented in worker); it claims commerce/Shopify/Stripe adapters, ML retraining, ClickHouse/BigQuery warehouse behavior, `src/...` paths that do not match the monorepo, and performance numbers without tests. Its Logto and two-tenant auth sections are superseded by ZITADEL/Ory decisions.

**Disposition:** Correct or split into “architecture proposal” and “current implementation.” At minimum fix package paths, auth, worker SSR status, actual storage, and unimplemented commerce/ML claims.

## 6. `docs/2026-05-23/ROADMAP.md`

**Classification:** historical.

**Factual implementation status:** The file explicitly says on lines 8–9 that the 2026-05-23 roadmap is outdated and points to a later status document. That declaration is itself accurate; its original schedule and phase percentages are historical.

**Evidence:** `docs/2026-05-23/ROADMAP.md`; `docs/2026-07-11/STATUS.md`; current `packages/server/src/domains/`; git commits `d983a9d` and `c28b897` (roadmap/status audit work).

**Stale claims:** Original deliverables, GrapesJS decision, commerce-engine percentage, weeks, hiring, revenue projections, and success criteria are no longer current planning facts. The document also conflicts internally: its header says custom inline editor, while Phase 2 and the decision log still say GrapesJS.

**Disposition:** Mark/leave historical. Do not correct the old plan in place; point readers to a current status/roadmap.

## 7. `docs/2026-05-23/BUILD_PLAN.md`

**Classification:** stale-needs-correction.

**Factual implementation status:** A broad architectural build plan. Several foundations are now implemented (DDD domains, event bus, agent/analytics queues, tracing, edge/client packages), while commerce, Nango integration scripts, and portions of the proposed state/ML system remain future or have changed shape.

**Evidence:** `packages/server/src/domains/`; `packages/server/src/shared/event-bus.ts`; `packages/server/src/shared/bullmq-queues.ts`; `packages/server/src/domains/agent/`; `packages/server/src/domains/analytics/`; `packages/server/src/tracing.ts`; `packages/workers/src/`; `packages/client/src/editor/`; `packages/server/src/domains/integrations/`.

**Stale claims:** It repeatedly says the API is Hono + Node + Postgres + Redis only, says ClickHouse/local-dev behavior and BullMQ are future in places, names removed `src/server`/`src/commerce` paths, presents GrapesJS as the merchant editor, and claims a custom JSX-to-JSON layer and generic machine wrapper not matching current code. It also contains encoding corruption and contradictory auth/editor decisions.

**Disposition:** Correct. If retained as a historical design, add a dated historical banner; otherwise rewrite against actual package/domain paths and separate shipped work from proposals.

## 8. `docs/2026-05-23/FINDINGS.md`

**Classification:** stale-needs-correction.

**Factual implementation status:** A decision/findings record that correctly captures many architectural choices (generic documents, XState, Nango concept, human review), but its “final” implementation statements are mixed with superseded provider/editor decisions.

**Evidence:** `packages/server/src/domains/documents/`; `packages/server/src/domains/machines/`; `packages/server/src/domains/integrations/`; `packages/server/src/domains/agent/`; `packages/server/src/domains/flags/`; `packages/client/src/editor/`; `packages/server/src/domains/auth/`; `docker-compose.yml`.

**Stale claims:** It names GrapesJS and Clerk/Lucia/Auth0 in the use list and key decisions, while current source uses an inline editor and ZITADEL/Ory auth. It claims Nango actions, user functions, machine transition analytics, and a complete commerce integration bridge that are not all wired. “Final,” “carrier integrations done,” and competitor/price assertions overstate repository evidence.

**Disposition:** Correct, or explicitly mark as a historical findings snapshot. Preserve the useful rationale but update provider/editor status and distinguish implemented domains from target integrations.

## 9. `docs/2026-05-23/POSITIONING.md`

**Classification:** design-reference.

**Factual implementation status:** Messaging and go-to-market positioning, not a technical status document. The repository supports enough platform primitives to make the positioning direction plausible, but not the complete commercial promise.

**Evidence:** `package.json`; `packages/server/src/domains/`; `packages/client/src/editor/`; `packages/workers/src/`; `packages/server/src/domains/analytics/`.

**Stale claims:** “replaces seven tools,” per-visitor AI layouts, daily model retraining, native checkout/commerce, and Shopify/standalone parity are not demonstrated current implementation facts. The price and competitive quadrant are hypotheses.

**Disposition:** Leave as design-reference. Add a vision disclaimer if it is surfaced alongside engineering docs.

## 10. `docs/2026-05-23/DIFFERENTIATION.md`

**Classification:** design-reference.

**Factual implementation status:** Build-vs-use/product differentiation rationale. Current code does contain custom platform differentiators (documents, agents, flags, analytics, editor, catalogs), but the commercial comparison is not a shipped-feature inventory.

**Evidence:** `packages/server/src/domains/documents/`; `packages/server/src/domains/agent/`; `packages/server/src/domains/flags/`; `packages/server/src/domains/analytics/`; `packages/client/src/editor/`; `packages/server/src/domains/tenant/`; `packages/server/package.json`.

**Stale claims:** It lists GrapesJS and Clerk/Lucia/Auth0 as selected infrastructure although current auth/editor decisions differ. Claims that all AI layout generation, per-visitor layout personalization, ML insights, and schema-level attribution are complete are not supported as end-to-end product behavior. Vendor stars, latency, launch duration, and competitor assertions are external/business claims.

**Disposition:** Leave as design-reference, but correct provider/editor tables if they are intended as current technical decisions.

## 11. `docs/2026-05-23/STRESS_TEST.md`

**Classification:** design-reference.

**Factual implementation status:** A conceptual architecture stress test. It demonstrates how auth/rate limiting/workflows could map onto json-render/XState/Nango; it is not evidence that those capabilities were implemented through that exact path.

**Evidence:** `packages/server/src/domains/auth/`; `packages/server/src/domains/machines/`; `packages/server/src/domains/integrations/`; `packages/workers/src/auth.ts`; `packages/server/src/shared/org.ts`; `packages/server/src/domains/flags/`.

**Stale claims:** “Build auth entirely on our platform (no Logto)” conflicts with the current ZITADEL/Ory design and implementation. The examples use malformed control characters and old provider assumptions. Current rate limiting/auth details are infrastructure/domain code, not proof of the proposed catalog-handler approach.

**Disposition:** Leave as a design/reference experiment, but mark the Logto/no-provider premise historical and update the provider statement.

## 12. `docs/2026-07-04/ARCHITECTURE_DECISIONS.md`

**Classification:** stale-needs-correction.

**Factual implementation status:** It is a later package/domain map and records real decisions, but its “updated 2026-07-25” content is contradicted by the current checkout’s larger package/domain surface and source.

**Evidence:** `pnpm-workspace.yaml`; `package.json`; `packages/server/src/domains/`; `packages/client/src/`; `packages/browser-sdk/`; `packages/workers/src/`; `docker-compose.yml`; `packages/server/src/domains/auth/`; `packages/server/src/domains/notifications/`; `packages/server/src/domains/collab/`.

**Stale claims:** “No admin package,” “no catalog/types packages,” “two packages: server + CLI,” “9 domains,” removed dependencies, and the package map are false for the current tree. The flags section says “Files: None yet” while `packages/server/src/domains/flags/` is implemented. It also mixes BullMQ removed/re-added decisions and old editor paths.

**Disposition:** Correct as a current architecture map. Keep old decisions in git/history, not in a misleading current map.

## 13. `docs/2026-07-04/INFRASTRUCTURE_NEEDS.md`

**Classification:** design-reference.

**Factual implementation status:** Production/local infrastructure proposal. Compose currently includes Postgres, Dragonfly, ClickHouse, ZITADEL, S3-compatible storage, Jaeger, Vault, Nango, and Ory Keto, so the broad service inventory is partly real; Kubernetes/Vela scaling is not current deployment evidence.

**Evidence:** `docker-compose.yml`; `scripts/compose/ensure-extra-dbs.sh`; `packages/server/package.json`; `packages/workers/package.json`; `packages/server/src/tracing.ts`.

**Stale claims:** The “9 core” and phase tables describe planned scaling, Vela, Cloudflare KV/R2/Stream, and BullMQ/Mastra phases rather than checked-in production deployment. It omits current Ory Keto, S3 local substitute, Vault, notification/integration services, and newer package boundaries. Several statements say Nango is optional/profile-based although compose starts it in the default stack.

**Disposition:** Leave as infrastructure design reference, but update the local topology and explicitly separate implemented compose services from future production architecture.

## 14. `docs/2026-07-04/agent-domain.md`

**Classification:** historical.

**Factual implementation status:** The document explicitly labels itself a historical plan and says the domain is implemented. Current source confirms a substantial agent domain with entity/service/API/queue/worker/tools, tests, Mastra support, lifecycle/review guards, and tracing.

**Evidence:** `packages/server/src/domains/agent/`; `packages/server/src/domains/agent/service.test.ts`; `packages/server/src/domains/agent/task-lifecycle.test.ts`; `packages/server/src/domains/agent/mastra/`; `docs/2026-07-11/STATUS.md`.

**Stale claims:** “Current State (Scaffolding),” missing files, and the Next Steps list are historical and contradicted by source. The old BullMQ rationale remains useful historical context.

**Disposition:** Leave/mark historical; do not rewrite the original plan as if it were a current status document.

## 15. `docs/2026-07-04/analytics-domain.md`

**Classification:** historical.

**Factual implementation status:** Explicitly historical plan. Current source has analytics ingestion/query/replay/browser-span code, ClickHouse and BullMQ workers, listeners, and extensive tests; the old scaffolding table and implementation checklist are obsolete.

**Evidence:** `packages/server/src/domains/analytics/`; `packages/server/src/domains/analytics/worker.ts`; `packages/server/src/domains/analytics/listeners.ts`; `packages/server/src/domains/analytics/browser-ingest.ts`; `packages/server/src/domains/analytics/replay-ingest.ts`; `packages/server/src/domains/analytics/*.test.ts`; `docker-compose.yml`.

**Stale claims:** “Remaining files not yet created,” two listeners, “API surface to be implemented,” and missing event subscriptions are false now. Some event names/storage details also predate current provenance/observability work.

**Disposition:** Leave/mark historical. Use current source/tests or a new status doc for implementation truth.

## 16. `docs/2026-07-04/context-domain.md`

**Classification:** historical.

**Factual implementation status:** Explicitly historical plan. Current source contains signal extraction, engine, service, Postgres adapter, routes, schema, tests, and domain wiring.

**Evidence:** `packages/server/src/domains/context/engine.ts`; `packages/server/src/domains/context/signal-extraction.ts`; `packages/server/src/domains/context/service.ts`; `packages/server/src/domains/context/adapters/postgres.ts`; `packages/server/src/domains/context/routes/`; `packages/server/src/domains/context/*.test.ts` where present; `docs/2026-07-11/STATUS.md`.

**Stale claims:** The “defined but not implemented” table, empty adapter, stub `/personalize`, and deferred implementation tasks are contradicted by current code. The old header/IP-driven segmentation story also conflicts with later behavior-based segment design in `documents-domain.md`.

**Disposition:** Leave/mark historical; do not correct the plan into a current spec without reconciling the segment model.

## 17. `docs/2026-07-04/external-execution-layer.md`

**Classification:** design-reference.

**Factual implementation status:** A decision record that external FaaS was deferred. Current compose/source do have Nango, BullMQ, XState, and integration infrastructure, but whether all described execution flows are wired is more limited than the conceptual diagrams.

**Evidence:** `packages/server/src/domains/integrations/`; `packages/server/src/domains/machines/`; `packages/server/src/domains/agent/queue.ts`; `packages/server/src/shared/bullmq-queues.ts`; `docker-compose.yml`; git commit `bcac167` (Nango compose).

**Stale claims:** “Current async work uses BullMQ” is directionally true, but the document claims Nango/XState wrapper execution and user functions as available patterns that are not all present. Its “today” flows should not be treated as shipped integration behavior.

**Disposition:** Leave as a design/decision reference, with a small status caveat distinguishing infrastructure from wired integrations.

## 18. `docs/2026-07-04/flags-domain.md`

**Classification:** historical.

**Factual implementation status:** Explicitly historical plan. Current flags source has entity, schema, evaluation, service, Postgres adapter, CRUD/evaluate/stream routes, listeners, and tests.

**Evidence:** `packages/server/src/domains/flags/`; `packages/server/src/domains/flags/routes/stream.ts`; `packages/server/src/domains/flags/routes/stream.test.ts`; `packages/client/src/core/actions/flags.ts`; `packages/browser-sdk/src/modules/flags.ts`.

**Stale claims:** “API surface To Be Implemented,” empty implementation task list, and old polling design are obsolete. The document itself records the later SSE decision, but its earlier Phase 0 Postgres evaluation and current SDK integration details should not be read as one coherent current spec.

**Disposition:** Leave/mark historical. Retain it as the evolution record; use source/tests for current behavior.

## 19. `docs/2026-07-04/nango-domain.md`

**Classification:** stale-needs-correction.

**Factual implementation status:** Nango is in `docker-compose.yml` and current integration code/fixtures exist, but this document’s domain wiring and phase claims are a mixture of old plan and later compose facts.

**Evidence:** `docker-compose.yml`; `scripts/init/nango.ts`; `scripts/init/nango-connect.ts`; `packages/server/src/domains/integrations/`; `packages/server/src/domains/machines/`; `packages/server/src/domains/analytics/`.

**Stale claims:** It says the service is optional/profile-based while compose starts it by default; says integration scripts, machine wiring, analytics wiring, and agent/Mastra wiring are absent even though current integration/Nango support exists; and describes nonexistent `machines` implementation paths/handlers. The Phase 0–4 timeline is not current planning.

**Disposition:** Correct. Separate “Nango service/integration management currently exists” from “future provider-specific workflows and machine execution.”

## 20. `docs/2026-07-10/documents-domain.md`

**Classification:** stale-needs-correction.

**Factual implementation status:** Current documents code is substantial: typed document services, content types, pages/page trees, assets, refs, rich text, layout resolution/merge, permissions, and tests. The document also contains valuable current-ish design notes, but its many “implemented today/planned” assertions have drifted.

**Evidence:** `packages/server/src/domains/documents/`; `packages/server/src/domains/documents/services/`; `packages/server/src/domains/documents/refs/`; `packages/server/src/domains/documents/assets/`; `packages/server/src/domains/documents/content-types/`; `packages/server/src/domains/documents/services/*.test.ts`; `packages/client/src/components/rich-text/`; `packages/client/src/editor/content-entries.ts`; `packages/workers/src/cache.ts`.

**Stale claims:** It says `tenant_id`/ZITADEL identities and references later docs as authoritative while current code has evolving auth/org abstractions. It calls edge `$state` merge implemented, but separately lists content/HTML/resolve-ref caches as planned; it describes Cloudflare R2/Stream production flows while compose uses local S3; it claims behavior-based finite segments while older context docs use header-derived segments. API paths, field-level permissions, asset processing, and `resolveElementProps` behavior need source-by-source reconciliation.

**Disposition:** Correct and split into current contract versus design rationale. This is too implementation-specific to leave stale.

## 21. `docs/2026-07-11/AUTH.md`

**Classification:** historical.

**Factual implementation status:** The file explicitly says it was superseded by ZITADEL/HMAC changes and points to `docs/2026-07-13/AUTH.md`. Its summary mostly describes the newer architecture, but its pending identity/client statements are old.

**Evidence:** `docs/2026-07-13/AUTH.md`; `packages/server/src/domains/auth/`; `packages/server/src/shared/org.ts`; `packages/workers/src/auth.ts`; `packages/workers/src/hmac.ts`; `packages/client/src/auth/`.

**Stale claims:** `tenant_id` migration pending, SPA login not wired, and the old status table are contradicted by current auth/client code and the canonical auth doc. It should not be used instead of the July-13 or current auth implementation.

**Disposition:** Leave/mark historical and retain the superseded note.

## 22. `docs/2026-07-11/BROWSER_SDK.md`

**Classification:** stale-needs-correction.

**Factual implementation status:** `@noname/browser-sdk` exists with analytics, errors, trace, performance, flags, replay, privacy/lifecycle/transport, rrweb and web-vitals dependencies, and Vite build. Current server has corresponding browser ingest/replay/span endpoints and tests.

**Evidence:** `packages/browser-sdk/src/`; `packages/browser-sdk/package.json`; `packages/server/src/domains/analytics/browser-ingest.ts`; `packages/server/src/domains/analytics/replay-ingest.ts`; `packages/server/src/domains/analytics/browser-span-ingest.ts`; `packages/browser-sdk/src/modules/flags.ts`.

**Stale claims:** It describes flags as 30-second polling and SSE as future, while current flags code includes SSE support; it says replay compression and several Highlight-derived behaviors are implementation facts although they remain proposals or differ in code. Endpoint method/payload examples and exact bundle-size claims need verification against current source/build output.

**Disposition:** Correct into a current SDK contract plus a separate design appendix. Do not leave the old polling/phase language as current.

## 23. `docs/2026-07-11/CLIENT_BUNDLE.md`

**Classification:** stale-needs-correction.

**Factual implementation status:** Client package is no longer merely a small scaffold: it has extensive admin/core/editor/auth/content/collaboration code, Rspack, json-render, MF, browser SDK integration, and tests. Worker bot SSR and personalization are implemented in current source.

**Evidence:** `packages/client/package.json`; `packages/client/src/main.tsx`; `packages/client/src/editor/`; `packages/client/src/admin/`; `packages/client/src/auth/`; `packages/workers/src/routes/bot-ssr.ts`; `packages/workers/src/routes/storefront.ts`; `packages/server/src/domains/edge/`; `packages/server/src/domains/tenant/`.

**Stale claims:** “scaffold exists,” “build unverified,” no browser login, no seed/demo layout, no bot SSR, and CLI/server status are obsolete or incomplete. The document still describes raw JSON human responses although `storefront.ts` now streams bot HTML and applies personalization. R2 production deployment remains a deployment concern, not proof the client is only a scaffold.

**Disposition:** Correct. Update status, package structure, worker behavior, auth, and seed/deployment evidence.

## 24. `docs/2026-07-11/DISTRIBUTED-TRACING.md`

**Classification:** current.

**Factual implementation status:** The implementation-status section says all tracing steps completed. Current manifests, compose, tracing bootstrap, AI spans, BullMQ propagation, Jaeger, and tests support that statement.

**Evidence:** `packages/server/src/tracing.ts`; `packages/server/package.json`; `docker-compose.yml`; `packages/server/src/shared/bullmq-trace.ts`; `packages/server/src/domains/agent/service.ts`; `packages/server/src/domains/agent/worker.ts`; `packages/server/src/domains/ai-pipeline/service.ts`; `packages/server/src/domains/analytics/jaeger-client.test.ts`; git history around `fdfdd6a` and subsequent tracing changes.

**Stale claims:** The early recommendation/implementation checklist is historical within the same file; the frontend OTel SDK section is a proposal and current browser tracing is hand-rolled in `packages/browser-sdk/src/modules/trace.ts`. The claim that every listed Hono/Drizzle/BullMQ span is automatically present still depends on runtime configuration and should be verified operationally.

**Disposition:** Leave as current with a clear separation between completed server tracing and future/hand-rolled browser tracing.

## 25. `docs/2026-07-11/DYNAMIC_CATALOG_BUILD.md`

**Classification:** stale-needs-correction.

**Factual implementation status:** Tenant catalog/MF infrastructure exists: tenant domain, bundler, queue/worker, R2 adapter, manifest store, client MF loader, and worker asset routes. Current manifests include MF/Rspack dependencies.

**Evidence:** `packages/server/src/domains/tenant/`; `packages/server/src/domains/tenant/adapters/bundler.ts`; `packages/server/src/domains/tenant/adapters/bundler.test.ts`; `packages/client/src/catalog-loader.ts`; `packages/client/src/mf-init.ts`; `packages/workers/src/routes/static.ts`; `packages/server/package.json`; `packages/client/package.json`.

**Stale claims:** The file calls the work Phase-1 foundation and says manifest persistence/build caching/marketplace are future, but current implementation has evolved beyond the described in-memory/simple model. It also claims exact build sizes, paths, package versions, and “three catalog layers” without matching current manifest/source contracts. The old “true cache Phase 2” statement is not a current guarantee.

**Disposition:** Correct against current tenant source/tests; preserve the architecture rationale separately if useful.

## 26. `docs/2026-07-11/MOBILE_APP.md`

**Classification:** design-reference.

**Factual implementation status:** The document explicitly says “Status: Design.” Current workspace has no `packages/mobile` or `packages/mobile-sdk` files, so the implementation remains unstarted in this checkout.

**Evidence:** `packages/` workspace enumeration via `pnpm-workspace.yaml`; absence of `packages/mobile/` and `packages/mobile-sdk/`; `packages/client/src/`; `packages/browser-sdk/src/`; `packages/server/src/domains/`.

**Stale claims:** API capability table labels many endpoints as available and says the mobile app needs no server changes; that is a design assumption, not evidence of mobile readiness. Dependencies and Expo versions are target values, not manifest facts.

**Disposition:** Leave as design-reference. Keep the explicit design status and do not present the API table as a tested mobile contract.

## 27. `docs/2026-07-11/MODULE_FEDERATION.md`

**Classification:** stale-needs-correction.

**Factual implementation status:** MF is implemented in client/tenant packages with Rspack and `@module-federation/runtime`/enhanced dependencies; catalog loading and async tenant builds exist.

**Evidence:** `packages/client/src/mf-init.ts`; `packages/client/src/catalog-loader.ts`; `packages/client/package.json`; `packages/server/src/domains/tenant/`; `packages/server/package.json`; `packages/workers/src/routes/static.ts`; `packages/server/src/domains/tenant/adapters/bundler.test.ts`.

**Stale claims:** “What needs to be built,” `^0.x` dependency versions, synchronous build/API flow, old `catalog-bundler.ts` paths, `tenants.catalog_manifest` schema, and 201/single-process assumptions are superseded by the current async tenant domain. Share-scope details and marketplace isolation remain design, not all shipped behavior.

**Disposition:** Correct to current MF/tenant contracts and move remaining marketplace/share-scope proposals into a design section.

## 28. `docs/2026-07-11/MULTI_TENANT_CATALOG.md`

**Classification:** stale-needs-correction.

**Factual implementation status:** It accurately motivated platform/tenant/marketplace catalog layers and last-wins merging; current client/server code implements the platform/tenant MF foundation. Marketplace remains less evidenced.

**Evidence:** `packages/client/src/catalog.ts`; `packages/client/src/registry.ts`; `packages/client/src/catalog-loader.ts`; `packages/server/src/domains/tenant/`; `packages/workers/src/routes/static.ts`; `packages/server/src/domains/tenant/adapters/manifest-store.ts`.

**Stale claims:** It says private catalogs are JSON specs/esbuild ES modules and proposes direct `import()` while current implementation uses MF/Rspack remotes and async builds. Component counts, filenames, R2 paths, renamed files, and phases are not current contracts. The statement that dynamic catalogs bundle their own json-render runtime conflicts with MF shared dependency configuration.

**Disposition:** Correct. Retain the layer/precedence rationale, but rewrite loading, build, storage, and API details from current code.

## 29. `docs/2026-07-11/SHOPIFY_ADAPTER.md`

**Classification:** historical.

**Factual implementation status:** It is a dated design document and explicitly says the adapter was not started/deferred. Current source has generic integrations and commerce-related extensions, but no evidence here of the proposed `domains/commerce/adapters/shopify.ts` implementation.

**Evidence:** `packages/server/src/domains/`; `packages/server/src/domains/integrations/`; `packages/server/src/domains/machines/`; absence of `packages/server/src/domains/commerce/`; `docs/2026-07-11/STATUS.md`.

**Stale claims:** Its proposed commerce package, Shopify methods, standalone Stripe adapter, and Phase 0/1/2 build order are not current implementation facts. The “8 existing domains” wording is obsolete.

**Disposition:** Leave/mark historical design. Do not correct into a false shipped-status document; create a new current adapter decision if Shopify work resumes.

## 30. `docs/2026-07-11/STATUS.md`

**Classification:** stale-needs-correction.

**Factual implementation status:** It was a status snapshot updated 2026-07-25, but current source has materially moved on: more domains/packages, richer auth, editor, collaboration, notifications, integrations, commerce evidence, and completed worker SSR/personalization.

**Evidence:** `packages/server/src/domains/`; `packages/client/src/`; `packages/workers/src/routes/bot-ssr.ts`; `packages/workers/src/routes/storefront.ts`; `packages/browser-sdk/src/`; `packages/server/src/domains/notifications/`; `packages/server/src/domains/collab/`; `packages/server/src/domains/integrations/`; `docker-compose.yml`; commits `1fb334a`, `98edf4`, `2d140c5`, `11a579e`.

**Stale claims:** The 9-domain list, two-package map, worker “SSR pending,” client “scaffold,” CLI-only status, “Nango integrations” absent, “GrapesJS editor” not to build, and Stripe/mock-commerce statements are contradicted by current tree/history. Its “current” status is therefore unsafe as a source of truth.

**Disposition:** Correct or archive. A new generated status snapshot should replace it; retain this as historical only after adding an explicit superseded banner.

## 31. `docs/2026-07-11/VISUAL_EDITOR.md`

**Classification:** stale-needs-correction.

**Factual implementation status:** The inline editor is substantially implemented and much larger than the proposed minimal HOC/props-panel design. `main.tsx` lazy-loads editor views; editor registry/canvas/layers/agent/collaboration/preferences and tests exist.

**Evidence:** `packages/client/src/main.tsx`; `packages/client/src/editor/index.ts`; `packages/client/src/editor/registry.ts`; `packages/client/src/editor/components/canvas/`; `packages/client/src/editor/components/layers/`; `packages/client/src/editor/collab/`; `packages/client/src/editor/agent/`; `packages/client/src/platform/editor-gate.tsx`; `packages/client/src/editor/*test.ts`.

**Stale claims:** “Planned, not yet implemented,” build order, minimal ~50KB HOC implementation, and exact `PATCH` save/publish examples are obsolete/incomplete. The document’s rejection of GrapesJS and same-client-package decision remain directionally accurate.

**Disposition:** Correct to describe the implemented editor and current auth/permission/save/collaboration contract; preserve the original rationale as historical design context.

## 32. `docs/2026-07-11/EDGE_WORKER.md`

**Classification:** stale-needs-correction.

**Factual implementation status:** Worker JWT/HMAC/cache/API proxy/static assets are implemented; bot HTML streaming and personalization are now implemented in current source, not TODOs.

**Evidence:** `packages/workers/src/auth.ts`; `packages/workers/src/hmac.ts`; `packages/workers/src/cache.ts`; `packages/workers/src/renderer.ts`; `packages/workers/src/routes/bot-ssr.ts`; `packages/workers/src/routes/storefront.ts`; `packages/workers/src/routes/bot-ssr.test.ts`; git commits `1fb334a` and `98edf4`.

**Stale claims:** The status table says SEO prerender is ❌ and personalization is unused, while `bot-ssr.ts` renders React streams and `storefront.ts` uses personalized layouts. It names `x-tenant-id`/Postgres and older auth details where current identity/HMAC code uses evolving org conventions. The build order marks completed work as next/TODO.

**Disposition:** Correct. Keep the architecture explanation, but update status, identity headers, cache keys, worker routes, and deployment state.

## 33. `docs/2026-07-13/AUTH.md`

**Classification:** current.

**Factual implementation status:** This is the canonical ZITADEL OIDC, edge JWT validation, worker-to-server HMAC, dev-mode, and identity reference. Current compose, worker, server middleware, client PKCE/auth code, and auth tests support the core description.

**Evidence:** `docker-compose.yml`; `packages/workers/src/auth.ts`; `packages/workers/src/hmac.ts`; `packages/workers/src/renderer.ts`; `packages/server/src/shared/org.ts`; `packages/server/src/shared/hmac.contract.test.ts`; `packages/client/src/auth/`; `packages/server/src/domains/auth/`; `docs/2026-07-13/AUTH.md` cross-reference to the later identity decision.

**Stale claims:** The document contains development credentials/secrets and says production hardening is pending; those are current dev facts but must never be treated as production configuration. Its org-claim details are intentionally deferred to the linked 2026-07-25 identity decision, so this file is not the complete current identity contract.

**Disposition:** Leave as the current canonical early auth reference, with the linked identity document and secure-secret warning. Do not mark historical.

## Audit conclusion

The 33 documents divide into product/design references, explicitly historical plans, and several implementation/status documents that now need correction. The most urgent corrections are `STACK.md`, `TECH.md`, `BUILD_PLAN.md`, `ARCHITECTURE_DECISIONS.md`, `documents-domain.md`, `CLIENT_BUNDLE.md`, `BROWSER_SDK.md`, `DYNAMIC_CATALOG_BUILD.md`, `MODULE_FEDERATION.md`, `MULTI_TENANT_CATALOG.md`, `STATUS.md`, `VISUAL_EDITOR.md`, and `EDGE_WORKER.md`; each contains current-looking claims contradicted by manifests, source, tests, or subsequent commits. The explicitly self-labeled historical plans (`ROADMAP.md`, `agent-domain.md`, `analytics-domain.md`, `context-domain.md`, `flags-domain.md`, and July-11 `AUTH.md`) should remain available as history rather than silently rewritten.
