# Recent implementation Markdown audit

**Audit date:** 2026-09-14  
**Repository:** current `HEAD` `d983a9d0d58972585118357438794a6590e3fa34`  
**Assigned scope:** Every Markdown file under `docs/2026-09-05`, `docs/2026-09-07`, `docs/2026-09-08`, `docs/2026-09-09`, `docs/2026-09-10`, `docs/2026-09-12`, and `docs/2026-09-14`, excluding this report. **46 documents audited.**

## Method and classification

Every assigned file was read in full. Claims were compared with the current source tree, tests, package manifests, seed profiles, the current roadmap, and relevant Git history. The principal current authority is [`AUTHORITATIVE-ROADMAP-CURRENT.md`](./AUTHORITATIVE-ROADMAP-CURRENT.md); dated implementation records remain evidence, not planning authority.

- **current** — materially accurate current implementation/convention or current audit record.
- **historical** — accurate dated plan, handoff, incident, or verification record; not current status.
- **design-reference** — architecture/research proposal whose purpose is not shipped-status reporting.
- **stale-needs-correction** — materially outdated status, route, ownership, or “next” claim.
- **unclear** — evidence is insufficient or internally contradictory.

No assigned document, source file, or manifest other than this report was modified.

## Audit entries

### 1. `docs/2026-09-05/ADD-DOMAIN-VS-EXTENSION.md`

**Classification:** current.  
**Implementation status:** The platform-domain versus vertical-extension rule matches the current split: generic server domains, `packages/verticals/src/commerce`, and `packages/extensions/src/commerce`. The reuse rules for machines, documents, Nango, secrets, notifications, and tenant settings remain consistent with the roadmap.  
**Evidence paths:** `packages/server/src/domains`; `packages/verticals/src/commerce`; `packages/extensions/src/commerce`; `docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md`; `packages/server/src/bootstrap.ts`.  
**Stale claims:** “~15 platform domains (done)” is an informal dated estimate, not a measured inventory; “done” should not be read as production completeness.  
**Disposition:** Leave as the current architecture rule; update only if ownership boundaries change.

### 2. `docs/2026-09-05/CLEANUP-PLAN.md`

**Classification:** historical.  
**Implementation status:** The cleanup plan records completed edge, server, ports/errors, and client refactors, with live verification notes. The checked items and progress log are historical evidence; the final guest-cart caveat and deferred product work remain useful context.  
**Evidence paths:** `packages/client/src/platform`; `packages/server/src/shared`; `packages/workers/src`; `packages/server/src/domains/machines`; `packages/extensions/src/commerce`; `docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md`; history `d983a9d`, `c28b897`.  
**Stale claims:** Unchecked sections 1–3 and the old “before new domain” framing can be mistaken for open work; several line-number references are historical.  
**Disposition:** Keep unchanged as a dated cleanup record and point readers to the authoritative roadmap for remaining work.

### 3. `docs/2026-09-07/GLOBAL-ADMIN.md`

**Classification:** current.  
**Implementation status:** The single-shell/two-scope model, manifest-driven store views, extension loading, and no parallel global UI are consistent with current client/admin and tenant code. Global provisioning remains API-driven rather than a second UI.  
**Evidence paths:** `packages/client/src/admin`; `packages/client/src/catalog-loader.ts`; `packages/server/src/domains/tenant`; `packages/extensions/src/commerce`; `packages/auth/src/permissions.ts`.  
**Stale claims:** “already built” is limited to the listed store-scoping behavior; a global admin UI is explicitly not implemented.  
**Disposition:** Leave as the current MVP architecture decision.

### 4. `docs/2026-09-07/EXTERNAL-PROVIDERS-VIA-NANGO.md`

**Classification:** current.  
**Implementation status:** Current integrations code routes outbound provider access through the Nango port and keeps provider ingress at the integrations boundary. Nango setup/proxy and signed callback paths are implemented and live-tested for the current checkout path; provider-forwarded production ingress and real merchant connections remain gates where the document says so.  
**Evidence paths:** `packages/server/src/domains/integrations/{ports.ts,service.ts,adapters/nango.ts,routes}`; `packages/server/src/domains/webhooks`; `packages/server/src/domains/integrations/provider-event-receipts*`; `scripts/init/nango.ts`; `docs/2026-09-12/CHECKOUT-RELIABILITY-LIVE-VERIFICATION.md`.  
**Stale claims:** The exact “does not exist yet” wording for forwarded ingress is superseded by the implemented local Nango ingress/provider-receipt path; it should distinguish local/signed verification from real public provider delivery.  
**Disposition:** Correct only the ingress gate wording; retain the binding Nango-only rule.

### 5. `docs/2026-09-07/EXTENSION-LIFECYCLE-HOOKS.md`

**Classification:** current.  
**Implementation status:** Loader-owned lifecycle subscriptions and the Commerce `onLogin` hook exist, with deduplication and the lazy cart merge path.  
**Evidence paths:** `packages/extensions/src/index.ts`; `packages/extensions/src/commerce/{lifecycle.ts,registry.ts,cart.ts}`; `packages/client/src/catalog-loader.ts`; `packages/client/src/auth/session.ts`; lifecycle/cart tests.  
**Stale claims:** The scope is local extensions and intentionally does not claim federated lifecycle support; no material contradiction found.  
**Disposition:** Leave as the current lifecycle contract.

### 6. `docs/2026-09-07/SCOPED-PUBLIC-ENDPOINTS.md`

**Classification:** historical.  
**Implementation status:** The explicit narrow-path and per-call scope ideas remain implemented layers, but its no-auth-header guest lane was replaced by publishable-key verification.  
**Evidence paths:** `packages/server/src/domains/machines/routes/instances.ts`; `packages/workers/src/routes/public-routes.ts`; `packages/server/src/shared/require-public-actor.ts`; `packages/extensions/src/commerce/cart.ts`; `docs/2026-09-07/PUBLIC-ACCESS-MODEL.md`.  
**Stale claims:** The opening anonymous-grant mechanism and raw-fetch explanation are superseded by the publishable-key model and current extension/client boundaries.  
**Disposition:** Keep as historical security evolution with its superseded banner; do not use as the public-access authority.

### 7. `docs/2026-09-07/VERTICAL-SERVER-EFFECTS.md`

**Classification:** design-reference.  
**Implementation status:** The selected D boundary (slim platform-side vertical effects now, isolated extension backends later) is the design rationale behind current `packages/verticals` and capability/evidence wiring; the full external-backend platform is not a completed feature.  
**Evidence paths:** `packages/verticals/src/commerce`; `packages/server/src/domains/capabilities`; `packages/server/src/domains/integrations`; `packages/server/src/domains/evidence`; `docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md`.  
**Stale claims:** “chosen” should not be read as proof that every proposed Nango-forwarded mapper/effects module exists.  
**Disposition:** Leave as architecture research/decision reference and separate shipped code from horizon C.

### 8. `docs/2026-09-07/API-KEY-INTAKE.md`

**Classification:** current.  
**Implementation status:** The generic API-key-to-Nango connection model and server-only credential handling match integrations routes/service and Nango initialization. The document correctly retains open setup and real-key verification gates.  
**Evidence paths:** `packages/server/src/domains/integrations/{service.ts,routes,adapters/nango.ts}`; `packages/client/src/admin`; `scripts/init/nango-connect.ts`; `packages/server/src/domains/tenant`.  
**Stale claims:** “asserted by test, not intent” should be backed by a named credential non-persistence test; live proof with a placeholder is not provider validation.  
**Disposition:** Leave as current decision/implementation note, with the explicit open gates.

### 9. `docs/2026-09-07/EXTENSION-BACKENDS.md`

**Classification:** current.  
**Implementation status:** The signed dispatcher, canonical event boundary, BullMQ delivery policy, manifest install check, and local stub verification are represented in the implementation record; remote installation remains future.  
**Evidence paths:** `packages/server/src/domains`; `packages/verticals/src/commerce`; `packages/extensions/src`; `packages/server/src/shared/bullmq-queues.ts`; current roadmap.  
**Stale claims:** The live verification says scaffolding was removed, so it is evidence of a contract proof, not a permanent deployed extension backend.  
**Disposition:** Leave, but label the stub proof and remote-backend gates prominently when reused.

### 10. `docs/2026-09-07/MACHINE-INVOKE-EFFECTS.md`

**Classification:** design-reference.  
**Implementation status:** The generic invoke/effect contract is proposed separately from the completed flat-state machine execution. The machine engine remains pure and current checkout uses capability routes/provider workers rather than this unimplemented invoke runtime.  
**Evidence paths:** `packages/server/src/domains/machines`; `packages/server/src/domains/capabilities`; `packages/server/src/shared/bullmq-queues.ts`; `docs/2026-09-12/CHECKOUT-RELIABILITY-IMPLEMENTATION-DETAILS.md`.  
**Stale claims:** “implement after dispatcher proves the contract” remains future; it must not be read as shipped.  
**Disposition:** Leave as design reference.

### 11. `docs/2026-09-07/PUBLIC-ACCESS-MODEL.md`

**Classification:** current.  
**Implementation status:** Explicit public paths, publishable-key binding to the edge-resolved org, `requirePublicActor`, JWT-only sensitive transitions, and gateway-only access match source and live guest-commerce verification.  
**Evidence paths:** `packages/server/src/shared/require-public-actor.ts`; `packages/server/src/domains/machines/routes/instances.ts`; `packages/workers/src/routes/public-routes.ts`; `packages/extensions/src/commerce/cart.ts`; `docs/2026-09-12/CHECKOUT-RELIABILITY-LIVE-VERIFICATION.md`.  
**Stale claims:** The route example remains cart-specific; new public capabilities must be checked against current capability-route authorization rather than assumed from the list.  
**Disposition:** Leave as binding current pattern.

### 12. `docs/2026-09-08/SESSION-STATUS.md`

**Classification:** historical.  
**Implementation status:** It accurately records the 09-05–09-08 handoff, including work that later completed: XState migration, checkout reliability, Evidence, Orders, seeding, and fixtures.  
**Evidence paths:** `docs/2026-09-12/CHECKOUT-RELIABILITY-LIVE-VERIFICATION.md`; `docs/2026-09-12/EVIDENCE-PROVENANCE-IMPLEMENTATION.md`; `docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md`; current packages.  
**Stale claims:** The “not done tomorrow” list and continuation commands are no longer current; its own supersession note is correct.  
**Disposition:** Leave as dated handoff/history.

### 13. `docs/2026-09-08/XSTATE-REUSE-MIGRATION-PLAN.md`

**Classification:** historical.  
**Implementation status:** The planned normalization, ephemeral actors, guard-once behavior, flat-state persistence, and regression criteria were implemented and live-verified.  
**Evidence paths:** `packages/server/src/domains/machines/{engine.ts,machine-config.ts,*.test.ts}`; `docs/2026-09-12/CHECKOUT-RELIABILITY-IMPLEMENTATION-DETAILS.md`; `docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md`.  
**Stale claims:** Open Phase E/live sign-off language is superseded by the 09-12 evidence; invoke/effect remains intentionally separate.  
**Disposition:** Keep as historical plan with current-status pointer.

### 14. `docs/2026-09-09/NANGO-FORWARDED-WEBHOOKS-XSTATE.md`

**Classification:** current.  
**Implementation status:** The integrations ingress → receipt → BullMQ → normalized event → MachineEngine boundary matches current code and live signed-callback proof. Provider-specific code remains outside machines/webhooks.  
**Evidence paths:** `packages/server/src/domains/integrations`; `packages/server/src/domains/machines`; `packages/server/src/domains/webhooks`; `packages/server/src/domains/integrations/provider-event-receipts*`; `docs/2026-09-12/CHECKOUT-RELIABILITY-LIVE-VERIFICATION.md`.  
**Stale claims:** The proposed envelope/mapping registry and “should implement” list mix design with shipped receipt/worker paths; real public Stripe delivery is still deferred.  
**Disposition:** Keep, but split implemented local checkout path from future provider mappings/public delivery.

### 15. `docs/2026-09-09/DECISION-XSTATE-QUEUES-EVENT-BUS.md`

**Classification:** current.  
**Implementation status:** XState is the transition authority, BullMQ is durable provider work, and the event bus is fan-out; deterministic receipts/job IDs and one-transition behavior are implemented.  
**Evidence paths:** `packages/server/src/domains/machines`; `packages/server/src/domains/integrations/provider-event-receipts*`; `packages/server/src/shared/event-bus.ts`; `packages/server/src/shared/bullmq-queues.ts`; checkout reliability tests/verification.  
**Stale claims:** “migration must implement” is now a completed milestone for the flat-state scope; future snapshot/compound-state language remains valid.  
**Disposition:** Leave as current binding architecture, updating imperative tense where convenient.

### 16. `docs/2026-09-09/DECISION-GENERIC-MACHINE-ROUTES.md`

**Classification:** current.  
**Implementation status:** Generic machine routes remain infrastructure-only; checkout is exposed through the generic capability/vertical boundary and Nango callback worker.  
**Evidence paths:** `packages/server/src/domains/machines/routes`; `packages/server/src/domains/capabilities`; `packages/verticals/src/commerce/capabilities.ts`; `packages/server/src/domains/integrations`.  
**Stale claims:** The accepted `MachineRouteDeps` snippet includes `tenantSettings` as a dependency while current capability ownership may differ; the document’s core no-commerce-callback rule remains correct.  
**Disposition:** Leave as binding correction; refresh the type snippet against current source.

### 17. `docs/2026-09-09/XSTATE-DURABLE-COMMERCE-EXAMPLE.md`

**Classification:** design-reference.  
**Implementation status:** The example correctly distinguishes XState state decisions from durable timers/effects. Current cart/payment uses flat-state XState, Postgres, and BullMQ; the full invoked durable workflow shown is not implemented.  
**Evidence paths:** `packages/server/src/domains/machines`; `packages/server/src/shared/bullmq-queues.ts`; `packages/verticals/src/commerce`; `docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md`.  
**Stale claims:** The example’s “recommended” durable runtime options are future alternatives, not selected infrastructure.  
**Disposition:** Leave as design/reference example.

### 18. `docs/2026-09-09/GENERIC-CHECKOUT-PROVIDER-ADAPTERS.md`

**Classification:** design-reference.  
**Implementation status:** The provider-neutral adapter contract is represented by current commerce capability/mapping code and Nango proxy; the example’s provider adapter is illustrative rather than a complete adapter inventory.  
**Evidence paths:** `packages/verticals/src/commerce`; `packages/server/src/domains/integrations/adapters/nango.ts`; `docs/2026-09-12/SECOND-PROVIDER-MAPPING-FIXTURE.md`; provider mapping tests.  
**Stale claims:** “first registered adapter is Stripe” and “adding a provider” are design wording; the second-provider fixture proves mapping neutrality, not a real second account/delivery.  
**Disposition:** Leave as design reference and clarify fixture versus live-provider status.

### 19. `docs/2026-09-09/COMMERCE-VERTICAL-CREATION-AND-E2E.md`

**Classification:** current.  
**Implementation status:** The vertical/capability package split, trusted pricing, Nango proxy, normalized callbacks, and E2E acceptance path align with current implementation. The handler’s scaffold caveat is superseded by the implemented checkout capability, idempotency, receipt, and payment mapping work.  
**Evidence paths:** `packages/verticals/src/commerce`; `packages/extensions/src/commerce`; `packages/server/src/domains/capabilities`; `packages/server/src/domains/integrations`; `docs/2026-09-12/CHECKOUT-RELIABILITY-IMPLEMENTATION-DETAILS.md`.  
**Stale claims:** “contract scaffold only” and “do not expose” are materially stale; live callback-to-Orders projection in one run remains a roadmap proof task.  
**Disposition:** Correct implementation-status paragraph; retain the E2E checklist as a remaining release-proof checklist.

### 20. `docs/2026-09-09/DECISION-GENERIC-CAPABILITY-RUNTIME.md`

**Classification:** current.  
**Implementation status:** Generic capability registry/route, auth, idempotency, trusted handler boundary, and commerce checkout are present. The document’s implementation-status section correctly records the earlier empty-registry state only for its date, but current roadmap says checkout is now implemented.  
**Evidence paths:** `packages/server/src/domains/capabilities` and `packages/server/src/capabilities`; `packages/verticals/src/commerce/capabilities.ts`; `packages/server/src/domains/capabilities/*test*`; `docs/2026-09-12/CHECKOUT-RELIABILITY-IMPLEMENTATION-DETAILS.md`.  
**Stale claims:** Lines 101–116 say no commerce handler is registered and list registration as future; those claims are contradicted by current source.  
**Disposition:** Correct the implementation-status and remaining-order section; retain the generic runtime decision.

### 21. `docs/2026-09-09/DECISION-GENERIC-CHECKOUT-PAYMENTS.md`

**Classification:** stale-needs-correction.  
**Implementation status:** Its ownership rule and Nango/provider-neutral mapping remain correct, and the flow is now substantially implemented. However, the route is described as `machine/cart/:id/checkout` while current code uses `/api/capabilities/commerce.checkout`; payment mappings, idempotency, and receipt durability are no longer merely an implementation order.  
**Evidence paths:** `packages/verticals/src/commerce/capabilities.ts`; `packages/server/src/domains/capabilities`; `packages/server/src/domains/integrations`; `packages/server/src/domains/machines`; `docs/2026-09-12/CHECKOUT-RELIABILITY-LIVE-VERIFICATION.md`.  
**Stale claims:** Route shape, “first implementation” steps, and “test with Stripe” strikethrough are historical; order table remains intentionally absent.  
**Disposition:** Correct route/status/order sections and retain the boundary decision.

### 22. `docs/2026-09-09/COMMERCE-HARDENING-IMPLEMENTATION.md`

**Classification:** historical.  
**Implementation status:** It is a dated tracker whose workstreams were completed and final evidence was recorded on 09-12.  
**Evidence paths:** `docs/2026-09-12/CHECKOUT-RELIABILITY-LIVE-VERIFICATION.md`; `docs/2026-09-12/CHECKOUT-RELIABILITY-IMPLEMENTATION-DETAILS.md`; `packages/server/src/domains/{capabilities,integrations,machines}`; `packages/verticals/src/commerce`.  
**Stale claims:** `[~]` pending labels and the incomplete E2E/second-provider rows are superseded by later live evidence and fixture work, although real public webhook and live Orders proof remain separately deferred.  
**Disposition:** Leave as historical tracker with its current-roadmap/final-evidence pointers.

### 23. `docs/2026-09-10/CHECKOUT-RELIABILITY-PLAN.md`

**Classification:** historical.  
**Implementation status:** The ordered reliability plan was executed: event bus, XState, idempotency, provider receipts, and callback verification are recorded in 09-12 documents.  
**Evidence paths:** `packages/server/src/domains/machines`; `packages/server/src/domains/capabilities`; `packages/server/src/domains/integrations`; `docs/2026-09-12/CHECKOUT-RELIABILITY-LIVE-VERIFICATION.md`.  
**Stale claims:** Baseline says live DB/queue verification and callback-to-paid are pending; those are contradicted by final 09-12 evidence, except real public Stripe delivery and live checkout-to-Orders projection.  
**Disposition:** Keep as historical plan; do not use its baseline as current status.

### 24. `docs/2026-09-12/CHECKOUT-RELIABILITY-IMPLEMENTATION-DETAILS.md`

**Classification:** historical.  
**Implementation status:** Detailed milestone record accurately documents commits, implementation, Browser MCP, signed local callback, duplicate suppression, Postgres concurrency, and automated verification.  
**Evidence paths:** `packages/server/src/domains/{machines,capabilities,integrations}`; `packages/verticals/src/commerce`; `packages/extensions/src/commerce`; commits `2d140c5`, `8271199`, `78a53ad`; current roadmap.  
**Stale claims:** Counts and live environment results are date-scoped; local Nango-boundary simulation is not a real public Stripe webhook, as explicitly stated.  
**Disposition:** Leave as immutable milestone evidence.

### 25. `docs/2026-09-12/REPOSITORY-FORMATTING-CLEANUP.md`

**Classification:** historical.  
**Implementation status:** The documented Biome/typecheck/test/build cleanup is a completed repository-wide record.  
**Evidence paths:** `package.json`; package manifests; `biome.json`; current source; commit history after the cleanup; authoritative roadmap baseline.  
**Stale claims:** PASS counts and the proposed Conventional Commit are historical; the file does not establish a current rerun.  
**Disposition:** Leave as a dated cleanup record.

### 26. `docs/2026-09-12/FAVICON-FIX.md`

**Classification:** current.  
**Implementation status:** The SVG favicon exists and is declared by the client HTML; the recurring favicon 404 is resolved in the current client path.  
**Evidence paths:** `packages/client/public/favicon.svg`; `packages/client/index.html`; client build; current Browser MCP references.  
**Stale claims:** “0” console errors and the browser URL are dated verification, not a universal current environment guarantee.  
**Disposition:** Leave as a small current fix record.

### 27. `docs/2026-09-12/SECOND-PROVIDER-MAPPING-FIXTURE.md`

**Classification:** current.  
**Implementation status:** Configurable provider-event mapping and the Adyen-style fixture are implemented; normalized success/failure outputs remain provider-neutral and generic transport/machines were untouched.  
**Evidence paths:** `packages/verticals/src/commerce`; provider mapping tests; `packages/server/src/domains/integrations`; package manifests; current roadmap.  
**Stale claims:** The fixture is not evidence of a real Adyen account or delivery; “next roadmap item” is now completed history.  
**Disposition:** Leave, adding an explicit “fixture, not live provider” qualifier if reused.

### 28. `docs/2026-09-12/AUDITABLE-RECORDS-GENERIC-PATTERNS.md`

**Classification:** design-reference.  
**Implementation status:** Its provenance/evidence-kernel vocabulary, CloudEvents/PROV distinctions, record-link versus authorization separation, and staged design are consistent with the implemented evidence domain.  
**Evidence paths:** `packages/server/src/domains/evidence`; `packages/verticals/src/commerce/order-projection.ts`; `docs/2026-09-12/EVIDENCE-PROVENANCE-IMPLEMENTATION.md`; external sources cited in the document.  
**Stale claims:** It speaks of the kernel as a recommendation and says the first implementation should be future commerce proof; that implementation now exists.  
**Disposition:** Keep as design research, but add a pointer to the implemented evidence domain and distinguish proposal from shipped subset.

### 29. `docs/2026-09-12/AUDITABLE-RECORDS-DESIGN-START.md`

**Classification:** design-reference.  
**Implementation status:** This is explicitly a research starting point. Its separation of Documents, aggregates, events, records, and projections remains compatible with current Evidence and Commerce ownership.  
**Evidence paths:** `packages/server/src/domains/documents`; `packages/server/src/domains/evidence`; `packages/verticals/src/commerce`; `docs/2026-09-12/EVIDENCE-PROVENANCE-IMPLEMENTATION.md`.  
**Stale claims:** “not yet an implementation decision” remains true as a document purpose, but the proposed research acceptance criteria have since been answered by `AUDITABLE-RECORDS-RESEARCH.md`.  
**Disposition:** Leave as research starting point and link the completed research/implementation records.

### 30. `docs/2026-09-12/AUDITABLE-RECORDS-RESEARCH.md`

**Classification:** stale-needs-correction.  
**Implementation status:** The research recommendation is now partly implemented: `evidence` has records, activities, links, audit, authenticated reads, append/idempotency rules, and a Commerce projector.  
**Evidence paths:** `packages/server/src/domains/evidence`; `packages/verticals/src/commerce/order-projection.ts`; `packages/server/src/domains/evidence/routes.test.ts`; `docs/2026-09-12/EVIDENCE-PROVENANCE-IMPLEMENTATION.md`; `docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md`.  
**Stale claims:** “implementation proposal/not yet implemented,” proposed `packages/records`, and the recommendation that the first concrete commerce proof is still future are stale.  
**Disposition:** Correct implementation-status and package-path sections; retain research comparison and future order aggregate/projection stages.

### 31. `docs/2026-09-12/EVIDENCE-PROVENANCE-IMPLEMENTATION.md`

**Classification:** current.  
**Implementation status:** Evidence tables, immutable primitives, authenticated read API, tenant/idempotency/link guarantees, schema push, and Commerce `PAYMENT_SUCCEEDED` projection are implemented and tested.  
**Evidence paths:** `packages/server/src/domains/evidence`; `packages/verticals/src/commerce/order-projection.ts`; `packages/server/src/drizzle.ts`; `packages/server/drizzle.config.ts`; evidence and projection tests; `docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md`.  
**Stale claims:** The document does not claim a full order aggregate; the remaining gap is the later live checkout-to-Orders proof and order operations, which should be linked explicitly.  
**Disposition:** Leave as current implementation record.

### 32. `docs/2026-09-12/CHECKOUT-RELIABILITY-LIVE-VERIFICATION.md`

**Classification:** historical.  
**Implementation status:** Complete dated milestone record: infrastructure, schema push, Browser MCP checkout, signed callback-to-paid, duplicate suppression, concurrency, and build/test verification.  
**Evidence paths:** `packages/server/src/domains/{capabilities,integrations,machines,evidence}`; `packages/verticals/src/commerce`; `packages/extensions/src/commerce`; commits `7f04bd3`, `845296a`; current roadmap.  
**Stale claims:** Initial unavailable-services gate and old test counts are historical; the callback remains a local Nango-boundary simulation, not public Stripe delivery.  
**Disposition:** Leave unchanged as historical evidence.

### 33. `docs/2026-09-12/ORDERS-ADMIN-IMPLEMENTATION.md`

**Classification:** historical.  
**Implementation status:** The read-only Commerce Orders surface, evidence links, permission, route, seed layout, and generic evidence API consumption are implemented.  
**Evidence paths:** `packages/extensions/src/commerce/orders-admin.tsx`; `packages/extensions/src/commerce`; `packages/server/src/domains/evidence`; `packages/client/src/platform-routes.ts`; `packages/auth/src/permissions.ts`; `packages/seeding/src/profiles/commerce`; current roadmap.  
**Stale claims:** The document’s expected commands and “Browser MCP live checkout-to-Orders” deferral are date-scoped; the roadmap still lists one complete live checkout-to-Orders run as P0.  
**Disposition:** Keep as historical initial-slice record; do not infer full order management from it.

### 34. `docs/2026-09-12/EDGE-SEO-PRERENDER-IMPLEMENTATION.md`

**Classification:** historical.  
**Implementation status:** React 19 edge streaming, SEO extraction, fallback renderer, and local Googlebot verification are implemented for the documented scope.  
**Evidence paths:** `packages/workers/src/routes/bot-ssr.ts`; `packages/workers/src/renderer.ts`; `packages/workers/src/routes/storefront.ts`; worker tests/manifests; current roadmap.  
**Stale claims:** “personalization is next” is superseded by `EDGE-PERSONALIZATION-IMPLEMENTATION.md`; local HTTP verification does not prove Wrangler production deployment.  
**Disposition:** Leave as historical implementation record with current-roadmap pointer.

### 35. `docs/2026-09-12/EDGE-PERSONALIZATION-IMPLEMENTATION.md`

**Classification:** historical.  
**Implementation status:** Edge tenant resolution, signed personalization request, signal forwarding, fallback, and desktop/mobile/tablet local Browser MCP scenarios are implemented.  
**Evidence paths:** `packages/workers/src/routes/storefront.ts`; `packages/workers/src/routes/bot-ssr.ts`; `packages/server/src/domains/edge`; worker tests/manifests; current roadmap.  
**Stale claims:** “next edge roadmap item is deployment” is planning-history language; production Wrangler/Cloudflare deployment remains a P2 operational task, not absent application code.  
**Disposition:** Leave as historical local-scope verification record.

### 36. `docs/2026-09-14/TEST-FIXTURE-ARCHITECTURE-ANALYSIS.md`

**Classification:** current.  
**Implementation status:** The neutral pure-fixture versus seeding versus domain-local-test-double boundary is implemented initially: `packages/fixtures` exists and seeding/tests consume it without tests importing profiles.  
**Evidence paths:** `packages/fixtures/{package.json,tsconfig.json,src}`; `packages/seeding/src/profiles/platform/index.ts`; notification tests; workspace manifests; `docs/2026-09-14/SEEDING-ARCHITECTURE-IMPLEMENTATION.md`.  
**Stale claims:** Much of the file is recommendation and migration plan; the proposed package is now present, while future `test-support` and promotion rules remain guidance.  
**Disposition:** Leave as current architecture analysis, updating the opening “add package” wording if it is intended as a completed implementation report.

### 37. `docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md`

**Classification:** current.  
**Implementation status:** This is the authoritative current code-truth roadmap. Its baseline, Commerce ownership split, completed checkout/Evidence/seeding milestones, P0 release evidence, P1 product gaps, and P2/P3 future work match current source and verification records.  
**Evidence paths:** `packages/server/src/domains`; `packages/verticals/src/commerce`; `packages/extensions/src/commerce`; `packages/seeding`; `packages/fixtures`; referenced 09-12 evidence records; `git rev-parse HEAD` `d983a9d0d58972585118357438794a6590e3fa34`.  
**Stale claims:** Its baseline test count is date-scoped and should be rerun when changed; the roadmap itself explicitly distinguishes local verification from production release work.  
**Disposition:** Keep as the planning authority.

### 38. `docs/2026-09-14/SEEDING-ARCHITECTURE-IMPLEMENTATION.md`

**Classification:** current.  
**Implementation status:** `packages/seeding` runner/CLI, platform/Commerce/full profiles, trusted evidence seed port, idempotent steps, and separation from behavioral E2E are implemented.  
**Evidence paths:** `packages/seeding/src/{cli.ts,profiles}`; `packages/verticals/src/commerce/demo-order-evidence.ts`; `packages/server/src/domains/evidence`; root package scripts; current roadmap.  
**Stale claims:** It calls the architecture record “not the current roadmap” correctly; the verification contract describes checks to perform rather than results for every profile.  
**Disposition:** Leave as current implementation architecture record with roadmap pointer.

### 39. `docs/2026-09-14/ROADMAP-NEXT-STEP-EVALUATION.md`

**Classification:** historical.  
**Implementation status:** It accurately captures the pre-final-verification recommendation to finish XState Phase E, but that sign-off and the later checkout hardening were completed.  
**Evidence paths:** `docs/2026-09-12/CHECKOUT-RELIABILITY-LIVE-VERIFICATION.md`; `docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md`; `packages/server/src/domains/machines/engine.test.ts`; current Commerce source.  
**Stale claims:** Its ordered next steps, open Workstreams 2–4, and proposed immediate Commerce server domain conflict with the current P0 release-evidence roadmap.  
**Disposition:** Leave with its explicit superseded banner; do not use for next-step selection.

### 40. `docs/2026-09-14/AUDIT-ANALYTICS-PERMISSIONS-AUDITS.md`

**Classification:** current.  
**Implementation status:** This is a completed audit record of 21 July documents; its classifications, evidence paths, and 7/3/3/8/0 counts are internally complete and consistent with current analytics/auth/source paths.  
**Evidence paths:** Its cited `packages/server/src/domains/analytics`, `packages/auth`, `packages/client`, `packages/workers`, manifests, and history; `docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md`.  
**Stale claims:** Its audited documents intentionally contain stale claims; those are findings, not claims by this audit.  
**Disposition:** Leave as a current audit artifact; do not modify it as part of this report.

### 41. `docs/2026-09-14/AUDIT-ROADMAP-ADMIN.md`

**Classification:** current.  
**Implementation status:** The 33-document July-25 audit accurately identifies stale status/path/ownership claims and points to the current vertical/extension, editor, auth, seeding, and fixture implementation.  
**Evidence paths:** Its cited `packages/{auth,client,documents,extensions,fixtures,seeding,server,verticals,workers}`, current roadmap, and history through `d983a9d`.  
**Stale claims:** The audited documents remain stale by design; the audit’s “no source modified” statement is accurate for that audit.  
**Disposition:** Leave as current audit record and preserve its 33-document scope.

### 42. `docs/2026-09-14/AUDIT-PLATFORM-NOTIFICATIONS.md`

**Classification:** current.  
**Implementation status:** The 14-document notifications/webhooks/secrets audit accurately distinguishes shipped platform code, historical run logs, and stale RFC tables; its evidence covers current source/tests/manifests/history.  
**Evidence paths:** Its cited `packages/server/src/domains/{notifications,secrets,integrations,webhooks,agent}`, client components, manifests, `docs/2026-08-06/BUILD-MASTER-INDEX.md`, and history.  
**Stale claims:** Findings about assigned files are intentionally stale-document findings, not current claims of this audit.  
**Disposition:** Leave as current audit artifact.

### 43. `docs/2026-09-14/AUDIT-EARLY-FOUNDATIONS.md`

**Classification:** current.  
**Implementation status:** The 33-document early-foundations audit is a complete dated comparison against HEAD, correctly separating product references, historical plans, and stale implementation maps.  
**Evidence paths:** Its cited current packages, compose/manifests, worker/client/server tests, roadmap, and history `d983a9d`/related commits.  
**Stale claims:** Its document-level stale claims are findings; the early snapshot paths/counts are intentionally historical evidence.  
**Disposition:** Leave as current audit artifact.

### 44. `docs/2026-09-14/AUDIT-COLLAB-ARCHITECTURE.md`

**Classification:** current.  
**Implementation status:** The 33-document collab audit accurately reflects Automerge/Yjs rooms, Redis relay, worker separation, rich text, agent collaboration, and remaining manual verification gaps.  
**Evidence paths:** Its cited `packages/client/src/editor/collab`, `packages/server/src/domains/{collab,agent}`, workers, tests, manifests, and history `72b3a59`, `571ec3d`, `1a3bed5`.  
**Stale claims:** Assigned-document stale statements are findings; dated smoke counts are correctly treated as historical.  
**Disposition:** Leave as current audit artifact.

### 45. `docs/2026-09-14/AUDIT-EDITOR-IDENTITY.md`

**Classification:** current.  
**Implementation status:** The 21-document editor/identity audit accurately records current editor actions/collab, ZITADEL/Keto/folder scope, Mastra mock/live distinction, and the 6/2/0/13/0 classification counts.  
**Evidence paths:** Its cited `packages/client/src/editor`, `packages/server/src/domains/{auth,collab,agent,documents}`, `packages/auth`, `packages/seeding`, manifests, tests, and history.  
**Stale claims:** Findings about assigned files are intentionally stale-document findings; no material contradiction in the audit itself was found.  
**Disposition:** Leave as current audit artifact.

### 46. `docs/2026-09-14/AUDIT-PRODUCT-HISTORY.md`

**Classification:** current.  
**Implementation status:** The 30-document product/archive/history audit matches the current vertical/extension split, Evidence/Orders/seeding/fixture milestones, and the authoritative roadmap; its classifications and dispositions are internally coherent.  
**Evidence paths:** Its cited `packages/verticals/src/commerce`, `packages/extensions/src/commerce`, generic server domains, seeding/fixtures, 09-12 verification records, roadmap, manifests, and Git history.  
**Stale claims:** The audited product/history files intentionally contain stale or aspirational claims; those are audit findings.  
**Disposition:** Leave as current audit artifact; preserve its no-source/no-other-doc modification statement.

## Summary counts

| Classification | Count |
|---|---:|
| Current | 25 |
| Historical | 13 |
| Design-reference | 6 |
| Stale-needs-correction | 2 |
| Unclear | 0 |
| **Total** | **46** |

The highest-priority corrections are the superseded capability-runtime status, checkout route/implementation-plan wording, Nango ingress gate wording, Evidence research proposal status, and the old 09-12/09-10 checkout baselines. The current implementation authority remains [`docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md`](./AUTHORITATIVE-ROADMAP-CURRENT.md). Production deployment, real public Stripe webhook delivery, and one complete live checkout-to-Orders projection run remain release evidence tasks rather than reasons to reimplement completed foundations.

**Report path:** `docs/2026-09-14/AUDIT-RECENT-IMPLEMENTATION.md`  
**Document count:** **46 assigned documents audited** (target report excluded).
