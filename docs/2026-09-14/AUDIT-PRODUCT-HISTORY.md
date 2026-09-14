# Product-history documentation audit

**Audit date:** 2026-09-14  
**Scope:** Every Markdown file under `docs/2026-08-21`, `docs/2026-08-22`, `docs/2026-08-23`, `docs/archive`, `docs/product`, plus `docs/README.md`, `docs/MANUAL-VERIFICATION-CHECKLIST.md`, `docs/aiagents.md`, and `docs/FLAT_PROPS_MIGRATION.md`.  
**Documents audited:** 30.  
**Method:** Each in-scope file was read in full; claims were compared with current source/tests/manifests, the 2026-09-14 authoritative roadmap, and relevant Git history. No existing documentation or source was modified.

## Current repository baseline used for comparison

The current source deliberately owns commerce across `packages/verticals/src/commerce` (business capabilities and checkout/order projection), `packages/extensions/src/commerce` (components/actions/catalog and Orders UI), and generic server domains (machines, capabilities, evidence, documents, auth, persistence). Current evidence includes `docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md`, `docs/2026-09-12/CHECKOUT-RELIABILITY-LIVE-VERIFICATION.md`, `docs/2026-09-12/EVIDENCE-PROVENANCE-IMPLEMENTATION.md`, `docs/2026-09-12/ORDERS-ADMIN-IMPLEMENTATION.md`, `docs/2026-09-14/SEEDING-ARCHITECTURE-IMPLEMENTATION.md`, and `docs/2026-09-14/TEST-FIXTURE-ARCHITECTURE-ANALYSIS.md`. Source corroboration includes `packages/verticals/src/commerce/{capabilities.ts,checkout-flow.test.ts,order-projection.ts}`, `packages/extensions/src/commerce/{catalog-schemas.ts,components.tsx,orders-admin.tsx}`, `packages/server/src/domains/{capabilities,evidence,machines}`, `packages/seeding`, and `packages/fixtures`.

## Assigned dated status, research, and incident records

### 1. `docs/2026-08-21/CURRENT_STATUS.md`
- **Classification:** historical.
- **Implementation status:** Accurate as an 2026-08-21 snapshot for the then-small commerce extension and custom editor, but superseded. Checkout capability, payment-state mapping, durable receipts/idempotency, order projection, Evidence records, seeding, and fixtures now exist; commerce is intentionally not a `server/src/domains/commerce` branch.
- **Evidence:** `docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md`; `packages/verticals/src/commerce`; `packages/extensions/src/commerce`; `docs/2026-09-12/CHECKOUT-RELIABILITY-LIVE-VERIFICATION.md`.
- **Stale claims:** “Commerce server domain 0%,” “no server commerce domain,” “checkout 0%,” and the proposed `packages/server/src/domains/commerce` tree. Its own banner correctly says it is historical.
- **Disposition:** Leave unchanged and keep clearly marked historical; do not use for current planning.

### 2. `docs/2026-08-22/BROWSER-AGENT-COLLAB-SMOKE-RESULTS.md`
- **Classification:** historical.
- **Implementation status:** A dated, valuable smoke-test record. The tested login/admin/editor/collaboration flows and agent folder authorization correspond to current client/server areas, but the exact seeded UI and token behavior are time-bound.
- **Evidence:** `packages/client/src/editor`, `packages/client/src/admin`, `packages/server/src/domains/agent`, `packages/server/src/domains/collab`, Git history commit `a5e4b4b` (collaborator identity fix), and current verification docs.
- **Stale claims:** The 13/13 result, “commerce not enabled” context, Windows `dev` script issue, and “add listMyFolders” follow-up are not current baseline assertions.
- **Disposition:** Keep as historical test evidence; add a link to newer verification only if an index is updated later.

### 3. `docs/2026-08-22/EDITOR-LAYOUT-CSS-BEST-PRACTICE.md`
- **Classification:** design-reference.
- **Implementation status:** The described cascade-layer and scroll-container fix is implemented in `packages/client/src/editor/components/shell/editor-layout.css` and `EditorLayout.tsx`; the CSS principles remain reusable.
- **Evidence:** Those two source files, client build history (`cb8eadf`), and editor tests/build configuration.
- **Stale claims:** “As of 2026-08-22” and the exact compiled-bundle verification are historical; they are not a current regression report.
- **Disposition:** Leave as dated design/incident reference; no correction required.

### 4. `docs/2026-08-22/AI-AGENTIC-COMMERCE-FUTURE.md`
- **Classification:** design-reference.
- **Implementation status:** Phases A–E are proposals. Current repository has agent tooling and a commerce checkout foundation, but not the complete UCP/ACP/AP2 protocol surface, autonomous staff roadmap, or all claimed optimization infrastructure.
- **Evidence:** `packages/server/src/domains/agent`, `packages/verticals/src/commerce`, `docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md` P3 list, and the document’s external source links.
- **Stale claims:** Protocol/platform status is research-time-sensitive; “architecture already produces” a complete agent-composable commerce model and the Phase A/B deliverables should not be read as shipped.
- **Disposition:** Leave as future/design research; retain explicit “future plans” framing and avoid presenting tables as implementation status.

### 5. `docs/2026-08-22/DIFFERENTIATION-WITH-EXAMPLES.md`
- **Classification:** design-reference.
- **Implementation status:** Scenarios, schemas, competitor contrasts, and evidence checklist are product hypotheses. Collaboration and agent approval have real partial evidence; per-visitor generated layouts, order-level schema attribution, and Shopify/standalone adapter flip are not all implemented.
- **Evidence:** `packages/client/src/editor`, `packages/server/src/domains/agent`, `packages/server/src/domains/analytics`, `packages/verticals/src/commerce`, `docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md`.
- **Stale claims:** “All pieces exist,” “no competitor,” and “built-in” assertions overstate current proof; several sample component types do not exist in the commerce catalog.
- **Disposition:** Keep as design/sales reference; do not correct into a status document.

### 6. `docs/2026-08-22/CURRENT-UX-AUDIT.md`
- **Classification:** historical.
- **Implementation status:** Correct for the live stack inspected on 2026-08-22: demo-only storefront, no enabled commerce extension, client cart skeleton, and no checkout route at that time. Current checkout and order projection have since landed, while catalog breadth remains incomplete.
- **Evidence:** `packages/seeding/src/profiles/commerce`, `packages/extensions/src/commerce`, `packages/verticals/src/commerce`, `docs/2026-09-12/CHECKOUT-RELIABILITY-LIVE-VERIFICATION.md`, and the 2026-09-14 roadmap.
- **Stale claims:** “Commerce 0%,” “checkout ❌,” “only 2 of 50,” and the exact yogastore test artifacts are historical; the prescribed acceptance walk is not a current result.
- **Disposition:** Leave as dated UX baseline; mark/retain historical rather than correcting old observations.

### 7. `docs/2026-08-22/COMMERCE_ENGINE_GAP_ANALYSIS.md`
- **Classification:** stale-needs-correction.
- **Implementation status:** Its catalog backlog remains useful, but its central “server commerce 0% / no commerce domain / client-only cart” conclusion is false after the vertical checkout, idempotency, provider events, payment projection, and Orders admin work.
- **Evidence:** `packages/verticals/src/commerce/{capabilities.ts,order-projection.ts}`, `packages/extensions/src/commerce/{components.tsx,orders-admin.tsx}`, `docs/2026-09-12/CHECKOUT-RELIABILITY-LIVE-VERIFICATION.md`, `docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md`.
- **Stale claims:** Required `packages/server/src/domains/commerce` tree, 0% server status, checkout/order absence, and “only blocker” conclusion. Competitive tables and proposed schemas are design material, not verified implementation.
- **Disposition:** Mark historical or correct the executive summary and architecture path if this file remains linked as active research; the current roadmap must remain authoritative.

### 8. `docs/2026-08-22/COMPONENT_CATALOG_REQUIREMENTS.md`
- **Classification:** stale-needs-correction.
- **Implementation status:** The requirements/backlog is useful, and Hero/ProductCard plus OrdersAdmin exist, but the document’s examples use the removed `catalogProps(labels, config)` contract. Flat props migration is complete and current schemas use flat objects.
- **Evidence:** `packages/extensions/src/commerce/catalog-schemas.ts`, `packages/extensions/src/commerce/components.tsx`, `docs/FLAT_PROPS_MIGRATION.md`, `packages/client/src/component-schemas.ts`, `packages/client/src/editor/lib/schema-introspect.ts`.
- **Stale claims:** “2 of 50,” all `catalogProps` snippets, config/labels field paths, and server API assumptions. Some listed components remain absent and should stay backlog items.
- **Disposition:** Correct if used by engineers: convert examples to flat props, update implemented count and ownership, and distinguish backlog from shipped components. Otherwise mark as historical design specification.

### 9. `docs/2026-08-23/EDGE-STOREFRONT-FIXES.md`
- **Classification:** historical.
- **Implementation status:** The HMAC slug resolution, public flag ticket/public metadata routes, client public-flags read, and tests are implemented. The incident and local verification are a valid dated record.
- **Evidence:** `packages/workers/src/{resolve-slug.ts,routes/public-routes.ts,routes/proxy.ts}`, `packages/server/src/domains/flags/routes/{crud.ts,stream.ts}`, `packages/client/src/platform/browser-observability.ts`, corresponding tests.
- **Stale claims:** “fixed locally 2026-08-23” and exact test totals are historical; the secret synchronization follow-up is still not implemented as proposed.
- **Disposition:** Leave as incident/fix record; do not rewrite historical numbers.

### 10. `docs/2026-08-23/SSE-AUTH-ISSUES-ROOT-CAUSES.md`
- **Classification:** historical.
- **Implementation status:** Signed flag stream tickets, edge bypass/public route, abort-aware stream loop, contract-test relocation, and stale-test cleanup are present and covered by current source/tests.
- **Evidence:** `packages/server/src/domains/flags/routes/stream.ts`, `packages/browser-sdk/src/modules/flags.ts`, `packages/workers/src/routes/{proxy.ts,public-routes.ts}`, `packages/server/src/shared/hmac.contract.test.ts`, stream tests.
- **Stale claims:** Commit ID and 140/509 test totals describe the August run, not today’s baseline.
- **Disposition:** Leave as historical incident report.

### 11. `docs/2026-08-23/SHARED-SECRET-STRATEGY.md`
- **Classification:** design-reference.
- **Implementation status:** Still a proposal: no canonical `env/.env.shared`, `secrets:sync`, `secrets:check`, or fingerprint logging was found. Independent `WORKER_SERVER_SECRET` use remains in worker/server/seeding code.
- **Evidence:** `packages/workers/src/types.ts`, `packages/workers/src/hmac.ts`, `packages/server/src/shared/org.ts`, `packages/seeding/src/profiles/*`, package manifests/scripts.
- **Stale claims:** None if “Proposal—not yet implemented” remains true; acceptance criteria are unfulfilled.
- **Disposition:** Leave as proposal; do not label it implemented.

## Assigned archive

### 12. `docs/archive/2026-05-23/BUILD_PLAN.md`
- **Classification:** historical.
- **Implementation status:** Original Phase 0 architecture/build plan, subsequently edited (including a ZITADEL/update banner) but still a historical design record; some principles survived, while proposed commerce endpoints/domain and broad deliverables are not the current ownership model.
- **Evidence:** `docs/archive/2026-05-23/README.md`, `docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md`, current verticals/extensions source, Git history `bdd1f52`.
- **Stale claims:** Proposed `/api/commerce`, generic commerce domain, planned “build” status, and the later internal contradiction that describes both the custom editor and GrapesJS.
- **Disposition:** Leave archived.

### 13. `docs/archive/2026-05-23/README.md`
- **Classification:** current.
- **Implementation status:** Correctly identifies the directory as pre-implementation and points readers toward superseding material.
- **Evidence:** `docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md`, archive contents, Git history.
- **Stale claims:** Its superseding links reference older 2026-07-25/07-04 material rather than the current 2026-09-14 roadmap.
- **Disposition:** Correct the superseding-links list when docs are next maintained; retain the archive banner.

### 14. `docs/archive/2026-05-23/STRESS_TEST.md`
- **Classification:** historical.
- **Implementation status:** Architecture thought experiment, not proof that the platform can build the listed auth/rate-limit/payment systems. Current auth is ZITADEL-backed and current commerce is vertical-owned.
- **Evidence:** `packages/server/src/domains/auth`, `packages/verticals/src/commerce`, `docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md`.
- **Stale claims:** “can build ANY backend,” self-built auth mapping, and planned Typesense/edge capabilities are not implementation evidence.
- **Disposition:** Leave archived as design rationale.

### 15. `docs/archive/2026-07-30/CODEBASE-AUDIT-FIXED.md`
- **Classification:** historical.
- **Implementation status:** The listed July cleanup items are recorded as completed and source history supports many moves; later work has changed the baseline.
- **Evidence:** current source paths, Git commits around 2026-07-30/31, `docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md`.
- **Stale claims:** “fixed” is date-scoped; it does not cover later checkout, Evidence, seeding, or fixture work.
- **Disposition:** Leave archived.

### 16. `docs/archive/2026-07-31/ARCHITECTURE-FIXED.md`
- **Classification:** historical.
- **Implementation status:** The listed boundary/event-bus/API split changes are reflected in current server structure.
- **Evidence:** `packages/server/src/documents/contracts.ts`, `domain-events.ts`, `shared/event-bus.ts`, domain route directories.
- **Stale claims:** It is not a complete current architecture map and omits later vertical/extension ownership.
- **Disposition:** Leave archived.

### 17. `docs/archive/2026-07-31/AUDIT-FIXED.md`
- **Classification:** historical.
- **Implementation status:** July fixed/deferred items remain a useful changelog; current code contains the named helpers and splits.
- **Evidence:** `packages/server/src/domains/documents`, flags, agent, auth, machines, analytics; Git history.
- **Stale claims:** “deferred” and “done” are July snapshots; no current regression status is implied.
- **Disposition:** Leave archived.

### 18. `docs/archive/2026-05-23/TECH.md`
- **Classification:** historical.
- **Implementation status:** It contains substantial architecture rationale, including the custom inline editor correction, but also describes planned commerce APIs, SSR, adapters, and GrapesJS-era details that do not represent current implementation.
- **Evidence:** `packages/client/src/editor`, `packages/workers/src`, `packages/verticals/src/commerce`, `packages/extensions/src/commerce`, current roadmap.
- **Stale claims:** GrapesJS as visual editor, `/api/products`/`/api/checkout/create` contract, server/edge rendering assumptions, and “dev mode missing HMAC proceeds” versus current strict behavior.
- **Disposition:** Leave archived; do not use as technical source of truth.

### 19. `docs/archive/2026-05-23/STACK.md`
- **Classification:** historical.
- **Implementation status:** Technology inventory is useful historical context and correctly records the custom editor in one row, but contradictory build-vs-buy rows and planned services remain.
- **Evidence:** root/package manifests, `packages/client/src/editor`, `packages/verticals`, `packages/extensions`, current roadmap.
- **Stale claims:** GrapesJS in build table, uncertain local-dev rows, Phase 0/1/2 assignments, and planned Nango/Typesense/Cloudflare assumptions.
- **Disposition:** Leave archived.

### 20. `docs/archive/2026-05-23/ROADMAP.md`
- **Classification:** historical.
- **Implementation status:** Phase roadmap and success criteria are superseded by the 2026-09-14 roadmap; several Phase 0 items are now partially or substantially complete through a different architecture.
- **Evidence:** `docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md`, checkout/Evidence/order verification docs, current source.
- **Stale claims:** Weeks/timelines, GrapesJS Phase 2 item, unbuilt commerce-domain assumptions, and unchecked success criteria.
- **Disposition:** Leave archived.

## Assigned product documents

### 21. `docs/product/README.md`
- **Classification:** current.
- **Implementation status:** Correctly labels product docs as pitch/positioning and points engineering readers to the existing `docs/2026-08-06/README.md` and `docs/2026-08-06/MASTER-STATUS.md`.
- **Evidence:** `docs/2026-08-06/README.md`, `docs/2026-08-06/MASTER-STATUS.md`, `docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md`, Git history.
- **Stale claims:** None material; the links are intentionally historical status references, while the 2026-09-14 roadmap is now the newer authoritative planning source.
- **Disposition:** Leave as product-document index; keep current engineering status in the status/roadmap documents.

### 22. `docs/product/DIFFERENTIATION.md`
- **Classification:** stale-needs-correction.
- **Implementation status:** Product thesis remains valid as positioning; implementation references still describe GrapesJS and broad unbuilt AI/commerce capabilities.
- **Evidence:** `packages/client/src/editor`, `packages/extensions/src/commerce`, `packages/verticals/src/commerce`, current roadmap.
- **Stale claims:** GrapesJS as the visual editor, “all” differentiated layers built, and commerce/payment/adapter claims presented as shipped.
- **Disposition:** Keep as pitch material but correct implementation-specific editor wording and qualify roadmap claims.

### 23. `docs/product/FINDINGS.md`
- **Classification:** stale-needs-correction.
- **Implementation status:** Research conclusions and ZITADEL decision remain useful; current source supports generic machines/agent/auth/analytics in part, but not the proposed complete commerce/ML/Nango stack.
- **Evidence:** `packages/server/src/domains/auth`, `agent`, `analytics`, `machines`; `packages/verticals/src/commerce`; current roadmap.
- **Stale claims:** GrapesJS, old server paths, self-built commerce engine assumptions, edge JWT behavior, and broad “final” implementation language.
- **Disposition:** Keep as historical product findings; correct or prominently date/qualify engineering claims.

### 24. `docs/product/OVERVIEW.md`
- **Classification:** stale-needs-correction.
- **Implementation status:** Vision and user journeys are design/pitch content. Current CMS/editor/agent foundations exist, but the complete personalized commerce loop, ML insights, Shopify mode, and checkout claims are not all shipped.
- **Evidence:** current roadmap, `packages/client/src/editor`, `packages/server/src/domains/agent`, `packages/verticals/src/commerce`, `packages/extensions/src/commerce`.
- **Stale claims:** GrapesJS-based editor, “everything built in,” live ML/bandit insights, Shopify/standalone parity, and claimed performance/pricing.
- **Disposition:** Retain as product reference but correct editor name and label unimplemented journeys as vision.

### 25. `docs/product/POSITIONING.md`
- **Classification:** design-reference.
- **Implementation status:** Positioning is intentionally aspirational. The one-server/identity-agnostic framing matches product direction; full commerce, ML, Shopify, and managed-service capabilities remain roadmap.
- **Evidence:** `docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md` P1–P3; current vertical/extension/source boundaries.
- **Stale claims:** “both modes work,” complete commerce/checkout, continuous ML retraining, and price/revenue statements are not repository facts.
- **Disposition:** Leave as pitch/design reference, but do not cite as implementation status.

### 26. `docs/product/PRODUCT.md`
- **Classification:** stale-needs-correction.
- **Implementation status:** Principles and identity-agnostic product thesis remain valid; feature matrix and phase labels substantially describe future work. Current editor is custom inline, not GrapesJS; current commerce is partial but checkout/order projection exists.
- **Evidence:** `packages/client/src/editor`, `packages/verticals/src/commerce`, `packages/extensions/src/commerce`, current roadmap and live verification docs.
- **Stale claims:** GrapesJS/drag-drop wording, complete commerce and analytics/observability claims, Phase 0/1 feature availability, and unverified pricing/performance.
- **Disposition:** Keep as product reference but correct editor terminology and add explicit shipped-versus-planned labels.

## Standalone assigned files

### 27. `docs/README.md`
- **Classification:** current.
- **Implementation status:** Correctly directs readers to the 2026-09-14 authoritative roadmap and labels 2026-08-21 historical. The listed dated docs are valid paths in scope.
- **Evidence:** `docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md`, all listed files, Git commit `d983a9d`.
- **Stale claims:** Some “current” descriptions summarize August snapshots; archive/product links are broad rather than status-authoritative.
- **Disposition:** Leave; only adjust descriptions if the index is intentionally refreshed.

### 28. `docs/MANUAL-VERIFICATION-CHECKLIST.md`
- **Classification:** current.
- **Implementation status:** Correctly functions as a living, dated manual-verification log. Items remain open checks rather than claims that all behavior is shipped; source paths for workers, Redis fan-out, collab, and rich text are present.
- **Evidence:** `packages/server/src/shared/worker-runtime.ts`, `redis-fanout-status.ts`, collab/rich-text sources and tests, worker manifests.
- **Stale claims:** Individual August entries and linked decision records are historical; unchecked manual checks must not be mistaken for defects or completed verification.
- **Disposition:** Leave as living checklist; append new results rather than rewriting old entries.

### 29. `docs/aiagents.md`
- **Classification:** unclear.
- **Implementation status:** Seven lines are a skills/experience list, not a product or engineering document; no title, owner, date, or link establishes intended use.
- **Evidence:** `packages/server/src/domains/agent`, `mastra` configuration/manifests, and absence of references found by repository search.
- **Stale claims:** The Rust/PyO3 and middleware requirements are not claims about current repository implementation, but their purpose is undocumented.
- **Disposition:** Leave untouched per audit scope; clarify ownership/purpose only through a separate documentation decision.

### 30. `docs/FLAT_PROPS_MIGRATION.md`
- **Classification:** stale-needs-correction.
- **Implementation status:** The migration itself is implemented: schemas/renderers/introspection/spec utilities/seeds/tests use flat props and `catalogProps` split helpers were removed. Current source confirms this, but the document’s verification totals and “all done” inventory are a historical migration snapshot.
- **Evidence:** `packages/client/src/{component-schemas.ts,editor/lib/schema-introspect.ts,editor/lib/spec-utils.ts}`, `packages/extensions/src/commerce/catalog-schemas.ts`, `packages/documents`, `packages/seeding`, migration tests, Git commit `37a7d98`.
- **Stale claims:** 121 files/433 tests baseline, exact pre-existing client errors, and exhaustive component lists may no longer match current repository; `catalogProps` wording should be retained only as migration history.
- **Disposition:** Mark as completed historical migration record or update verification counts and current links; do not treat it as an active status source.

## Overall disposition

No assigned document should replace `docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md` for implementation status. The main corrective themes are: replace GrapesJS references with the custom inline editor; replace the proposed generic commerce-domain path with the current vertical/extension split; update commerce status from “0%/client-only” to the implemented checkout/idempotency/Evidence/Orders slice plus remaining catalog and order-operations gaps; and remove/update dead status links. Historical incident and archive records should remain unchanged and clearly historical.
