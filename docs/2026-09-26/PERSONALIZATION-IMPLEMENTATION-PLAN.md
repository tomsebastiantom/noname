# Platform-Defined Audiences and Measured Experiences — Implementation Plan

> **Plan date:** 2026-09-26 · **Implementation verification:** 2026-09-27
> **Status:** Core implementation, no-provider Browser MCP smoke, and reviewed source/docs commits pushed to `origin/main` are complete. The demo tenant has no audience/membership fixture, so the populated personalized shopper journey remains unverified; production consumer inventory and provider-backed checkout remain follow-up.
> **Approval:** The user explicitly authorized implementation after reviewing this plan.
> **Architecture context:** [`PERSONALIZATION-ARCHITECTURE-AND-VISION.md`](PERSONALIZATION-ARCHITECTURE-AND-VISION.md)
> **Pre-implementation code status:** [`../2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md`](../2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md)
> **Context-hash migration audit:** [`CONTEXT-HASH-AND-AUDIENCE-MIGRATION-ANALYSIS.md`](CONTEXT-HASH-AND-AUDIENCE-MIGRATION-ANALYSIS.md)

## 1. Purpose and boundaries

Build a complete, reusable platform capability for defining audiences from trusted activities published by any registered domain, assigning and expiring memberships through tenant-authored rules, selecting route/locale-compatible experiences for members, and measuring exposure and outcomes. `recent_buyer` is a reference example: Commerce emits a typed `commerce.order.paid` activity; a tenant-owned audience definition specifies qualification and expiry. Commerce must not hard-code that audience name or TTL. The selected measurement design is targeted and observational—not randomized A/B testing—so reports must not be described as causal lift. Every implementation phase below is required for this complete scope.

This plan began as a documentation-only proposal. The user later explicitly approved implementation; application code, local schema, and demo UI were updated without resetting Podman volumes or importing real provider credentials.

## Implementation and local verification record — 2026-09-27

- Implemented the typed Audience domain, versioned rules/memberships, experience bindings, private decision/render/outcome ledger, tenant-admin authoring UI, and aggregate observational reporting with account-level outcome rates and k=10 suppression based on distinct exposed/outcome accounts.
- Performance reports use a 30-day cohort range; private decision rows remain for at least 31 days and at most 60 days under a 30-day attribution window. Attribution still expires at each binding's configured goal window.
- Replaced active `contextHash` flag/analytics contracts with explicit subjects and named dimensions while retaining legacy PostgreSQL and ClickHouse history.
- Added server-owned Commerce paid activities and guarded provider-retry recovery. Browser input cannot assert paid state, account ownership, or trusted attribution dimensions.
- Applied the additive Drizzle schema locally. Historical counts remained unchanged: 94 PostgreSQL flag evaluation rows and 392 ClickHouse analytics events, including 95 legacy context-bearing events. The seeded active demo flag has no legacy segment rule; production flag-rule inventory remains deployment follow-up.
- Verification passed after Context retirement and account-report cleanup: 179 focused tests across 37 files; TypeScript checks for server, client, Browser SDK, Workers, seeding, verticals, and extensions; Biome check; production builds for server, Browser SDK, and client. Builds succeeded with existing SDK `import.meta`/IIFE and bundle-size warnings.
- Browser MCP confirmed sign-in, admin dashboard, the Audience authoring page, and visual editor. The authenticated account-performance request returned HTTP 200 with `rateDenominator: exposedAccountCount`, `minimumSampleSize: 10`, and `bindings: []`, as expected because the demo tenant has no audience fixtures. The final browser console capture has zero errors and one existing editor `initSync()` deprecation warning; snapshots/logs are under `.playwright-mcp/`.
- No real provider-backed checkout/callback was exercised. The demo tenant has no audience definitions or membership fixtures, so a populated personalized rendering/outcome journey remains unverified in-browser; deterministic service/Edge tests cover those transitions without provider credentials.

### Cross-domain context contract audit — 2026-09-27

- Active public flag and analytics contracts no longer accept, persist, or emit `contextHash`. Flags use `EvaluationSubject`, server-derived audience keys, and allow-listed typed properties; analytics uses named dimensions and the private account-level experience ledger. The former ClickHouse decision-level Audience report path was removed so a decision count cannot silently be substituted for the account-level report.
- Remaining production-source mentions are migration-boundary guards that explicitly reject legacy `contextHash`/segment/hash aliases. Tests retain negative payloads/assertions to prove those fields cannot enter or leave the new contracts.
- The old request-signal Context runtime/routes were unmounted and its unused resolver implementation has now been retired. `segments` and `context_cache` remain mapped only in `packages/server/src/domains/legacy-context/schema.ts` so additive Drizzle pushes preserve existing rows; do not drop those tables until retention, production-consumer, and export reviews approve it.
- `documents.segment` remains a legacy-named layout-variant key and is translated to the experience binding's `variantId`; it is not a customer audience, identity, or request-signal hash. Renaming that document schema is a separate migration and must not reintroduce segment-based targeting.
- Historical dated documents may still describe the former design. `docs/README.md` now identifies the current implementation plan as authoritative; historical references are not runtime contracts.
- Production tenant flag-rule inventory, external-consumer verification, and historic analytics access/retention decisions remain deployment follow-up. No data or Podman volume was deleted.

### Incremental build, verification, and commit workflow

1. Work in small, independently reviewable slices: legacy request-signal retirement; flag subject migration; Audience/Experience API and UI; trusted analytics attribution; Commerce activity integration; documentation.
2. For each slice, run the affected package typecheck, focused tests, and production build before calling the slice complete. Re-run the cross-package regression suite after contracts that cross domains change.
3. Verify the running app with Browser MCP after refresh: anonymous storefront/default layout, verified-account resolution, admin authoring, flag behavior, and a seeded test audience experience where fixtures are available. Record snapshots and console output; do not claim provider callbacks or a populated journey unless actually exercised.
4. Review `git diff --cached` for each slice, then create one small Conventional Commit (for example, `feat(flags): use explicit evaluation subjects` or `feat(analytics): report unique exposed accounts`). Never collect the whole project into one opaque commit; exclude credentials, local data, and generated browser evidence.
5. Push each fully built and verified slice to `origin main`. Preserve local Podman volumes and stop before any destructive data/schema cleanup that lacks an explicit retention review.

### In scope

- Add a platform-owned audience engine with tenant-authored, versioned definitions over registered typed domain activities, assignment lifecycle/expiry, idempotency, and tenant-admin definition UI + API. Domain modules register activity schemas; they do not provide or auto-activate default audience criteria in this implementation.
- Keep domain-specific activities in their owning verticals; Commerce emits a trusted paid-order fact without naming a target audience.
- For the Commerce reference adapter, derive paid-order account association from server-verified cart ownership; keep this source-specific work out of the reusable platform core.
- Process activities against configured audience rules with replay/recovery, then persist active memberships.
- Pass optional verified identity on the ordinary storefront schema request while preserving anonymous browsing.
- Select a finite storefront experience by combining a qualifying audience with the current normalized page/route and locale; route and locale remain transient request context, never membership criteria.
- Record which targeted experience was served and measure agreed outcomes by audience/experience using the existing analytics pipeline where feasible.
- Keep analytics observational by design: report exposure and outcome counts/rates with an explicit attribution window; do not claim causal impact without a randomized control.
- Replace the old request-signal segment-personalization system and its overloaded `contextHash` contracts. Use explicit audience membership for business cohorts, server-derived typed context plus an explicit evaluation subject for feature flags, and named trusted dimensions for analytics. Migrate existing rules/reports and preserve their approved intent; compatibility is transitional only. Remove old `contextHash` fields and request-signal paths after migration and retention checks.
- Test identity separation, rule versioning, expiry, tenant isolation, spoofing resistance, replay behavior, exposure/outcome attribution, and cache isolation.
- Add deterministic local fixtures and exact Podman Compose + Browser MCP verification steps.

### Explicit non-goals of this complete implementation

- ML/LLM inference, historical order scans on every page request, a general-purpose customer-data platform, editable customer profiles, or arbitrary public audience writes. The tenant-admin rule UI and API are in scope; advanced visual rule builders and arbitrary expression authoring are not.
- Treating staff teams, flags, cookies, client-side JWT decoding, observability identity, or a query-string `segment` as proof of customer membership or authorization.
- Per-user content in shared HTML/schema caches.
- Replacing feature flags with audiences or using flag storage as the audience database. Flags remain the release-control/rollout layer; migrate their input contract without silently changing targeting intent. Stable percentage-bucketing identity and any unavoidable assignment changes require explicit review.
- Domain-provided default audience criteria/templates or automatic activation; every tenant authors and activates its own rules. `recent_buyer` is only a demo seed, not a domain default.
- Spend-based authorization, discounts, pricing benefits, or other entitlements. Audiences may target experiences from trusted paid facts, but membership cannot grant access or benefits; that requires a separate server-enforced entitlement policy/domain.
- Using hashed request signals, visitor-to-segment mappings, or the client-controlled `tier` cookie for audience membership or experience selection. Remove the old Context resolver/cache and Edge `personalize` path after caller/data-retention review. Replace the shared `contextHash` contract by purpose: feature flags receive server-derived audience keys/allow-listed typed properties plus an explicit evaluation subject for deterministic rollout; analytics records named, server-owned experience dimensions. Migrate active rules and reports, preserve approved behavior, and remove old fields/endpoints after verification. Screen-size adaptation belongs to responsive UI, not device-based audience targeting. Trusted country/region or normalized campaign context can be registered as explicit fields when needed; raw referrer and arbitrary headers are never accepted directly.

These are deliberate product boundaries, not incomplete implementation work.

## 2. Audience, delivered experience, and measurement

The complete implementation serves and measures an experience for accounts that qualify for a meaningful group; it is not a generalized request-signal profile:

| Concept | Question | Example | Owner / lifetime |
|---|---|---|---|
| Verified identity | Which account is this request for? | tenant + verified user ID | Auth/HMAC; never a browser claim |
| Domain activity | What trusted fact happened? | paid order, subscription activated, return received | Durable typed event owned by its domain |
| Audience definition + membership | Which reusable rule currently qualifies this account? | `recent_buyer` from `commerce.order.paid`, expiring by configured policy | Platform-defined, tenant-scoped, versioned derived state |
| Experience decision | What should this audience member receive on this page/language? | `recent_buyer` + page scope + locale → published variant | Resolver combines active membership with current route/page and locale |
| Analytics | Was the experience served or rendered, and what happened afterward? | server-served decision, client-reported page view, later trusted outcome | Existing analytics pipeline, with audience/definition/variant attribution |
| Ordinary page inputs | Which page/content should render? | route and requested locale | Existing routing/localization; transient resolver inputs, not membership criteria |

A member may qualify across visits; normal route resolution and localization determine the current page/content, and normalized page/route plus locale scope the bound experience. Screen-size adaptation remains responsive UI behavior, not a device-based audience rule. The request input is a typed, allow-listed `ExperienceRequestContext` with a registry-based extension seam for future named fields such as trusted region or normalized campaign; those fields are not enabled by this implementation until their source, trust, and privacy rules are defined. No audience or experience path uses the old hashed-signal mechanism or client-controlled `tier` cookie. The legacy request-signal resolver/routes have been retired from runtime, while its old table mappings remain only to preserve data pending reviewed retention and consumer checks. Flags use explicit evaluation subjects and trusted server inputs; analytics uses named dimensions.

Measurement is targeted and observational: report served/exposure counts and outcome counts/rates for the configured audience/experience and a declared attribution window. This design does not randomly assign a holdout, so reports describe what happened among targeted members; they do not prove that the experience caused the outcome or was better than a control.

### Reuse boundary

- The platform audience evaluator has no Commerce-specific branches. Any owning domain can register a typed activity schema and publish trusted facts through the same internal activity port.
- Tenants author and activate their own criteria; domain modules provide activity schemas, not default audience rules.
- The resolver receives active audience membership separately from a typed, allow-listed, ephemeral `ExperienceRequestContext`. This implementation populates normalized page/route and locale; they scope a published experience binding but cannot create or extend membership.
- Define a registry contract for request-context field metadata, normalization, provenance, and permitted matching operators. The current registry exposes page/route and locale; adding named fields such as trusted region or normalized campaign must use this contract and define trust/privacy rules. Do not accept arbitrary headers, cookies, or free-form maps. Screen-size adaptation stays in responsive UI rather than device-based audience targeting.
- Do not reuse signal hashes, the `tier` cookie, or a per-visitor segment cache as substitutes for explicit request-context fields.

## 3. Baseline code audit: gaps before implementation

> The numbered inventory below is retained as a historical pre-implementation snapshot for traceability; do not interpret its source-state statements as current. Current outcomes and remaining checks are summarized in the implementation and cross-domain audit records above.

1. `GET /api/edge/schema/:siteId` is public in `packages/workers/src/routes/public-routes.ts`. `packages/workers/src/routes/proxy.ts` skips JWT resolution for ordinary public requests, so the HMAC sent to the origin has empty `x-user-id` even if the browser supplied a bearer token. `packages/server/src/domains/edge/api.ts` reads `orgId`, not `getUserId(c)`.
2. `packages/client/src/platform/use-app-page-loader.ts` explicitly sends `segment=default`; `packages/server/src/domains/edge/service.ts:getSchema()` resolves that segment and does not look up user audiences.
3. `packages/server/src/domains/context/{schema.ts,ports.ts,adapters/postgres.ts,service.ts}` contain legacy request-signal hashing and a visitor-to-segment cache, but no account-to-audience assignments or rule definitions. The new audience/experience flow does not use that resolver. The shared `contextHash` field is separately consumed by feature flags and analytics; migrate those consumers to explicit contracts rather than preserve the overloaded field.
4. `packages/server/src/domains/machines/routes/instances.ts` accepts client cart context, and its claim path uses `body.ownerUserId` rather than binding the owner to the signed-in actor. `packages/extensions/src/commerce/cart.ts` locally decodes JWT `sub` and submits it. The machine engine merges event params into persisted context.
5. Cart reads/updates/checkout need ownership review. The generic cart event route must reject browser or publishable-key attempts to send provider-only `PAYMENT_SUCCEEDED`/`PAYMENT_FAILED` events.
6. Capability checkout is public to support publishable-key checkout. Signed-in checkout needs deliberate optional-JWT handling; a raw `Authorization` header reaching the origin is not verified identity.
7. `packages/verticals/src/commerce/order-projection.ts` writes idempotent order/payment Evidence on success, but does not associate the paid cart with an account or update an audience.
8. `packages/server/src/domains/machines/engine.ts` persists the new state before awaiting `onTransitionComplete`. Provider jobs retry, but a retry that submits `PAYMENT_SUCCEEDED` to an already-paid final cart can fail before projection re-runs. `packages/server/src/shared/event-bus.ts` is not a durable substitute: handler errors are swallowed and Redis Pub/Sub is not an outbox.
9. `packages/workers/src/routes/storefront.ts` caches bot schema by site + path. `packages/workers/src/renderer.ts:fetchSchema()` keys by tenant + segment (no user dimension; no current callsite found). Neither is safe for private account-specific results as-is.
10. Existing tests cover HMAC, checkout mapping, and order Evidence, but not proxy JWT-to-HMAC identity propagation, audience storage, edge experience selection, cart-instance ownership, or audience-attributed exposure/outcome reporting.
11. `packages/server/src/domains/analytics/` already accepts `schemaId`/`variantId`, ingests server and browser events, and calculates impression/conversion counts by variant; it has no audience/rule/binding dimensions or trusted post-exposure attribution. `packages/client/src/admin/components/analytics/AnalyticsEventsAdmin.tsx` is a generic event/aggregation view, so extend this pipeline rather than creating a second analytics system.

## 4. Target behavior and proposed contract

```text
Domain-owned trusted activity
  → durable typed activity receipt (org, subject user, type/version, source ID, occurredAt, validated facts)
  → platform audience engine loads matching active rule definitions
  → declarative predicates evaluate the typed facts
  → generic assignment lifecycle applies assign/remove + configured expiry
  → domain/provider retry can resume idempotently

Ordinary storefront schema request
  → edge optionally verifies JWT; anonymous remains supported
  → signed orgId/userId reaches server; normal route/locale resolution remains unchanged
  → platform reads active memberships and the tenant's explicit audience→experience binding
  → resolver selects a configured finite published variant or safe default
  → server records the served decision; analytics later attributes trusted outcomes to it
  → shared layout/content returned, not customer-private data
```

### Reusable definition model proposed for review

A platform-owned, tenant-scoped, versioned audience definition should describe **what activity qualifies**, **what safe conditions to evaluate**, and **how membership changes/ends**. For example:

```yaml
key: recent_buyer
version: 1
trigger:
  activity: commerce.order.paid
  activityVersion: 1
when:
  all:
    - field: order.status
      operator: equals
      value: paid
membership:
  action: assign
  expiry:
    after: P30D
```

This is illustrative; final storage/JSON schema and supported predicate operators are implementation design work. Domain activities must have registered, validated schemas; rule predicates can only access allow-listed typed fields. Do not permit arbitrary code, SQL, user-supplied event types, or unvalidated JSON paths. `recent_buyer` is a seed/config example, not a special Commerce branch in the evaluator.

Creating a definition configures a reusable policy; it does **not** assign every customer. A membership is created only when a later trusted activity matches an active version and its condition. The rule’s expiry is applied at that assignment, with `expiresAt = activity.occurredAt + expiresAfter`; retries of the same event cannot extend it. A separate qualifying activity may refresh it according to the rule.

The complete implementation includes a permissioned tenant-admin **UI and API**, plus idempotent seed/import support. Keep eligibility rules separate from the experience binding: an authorized admin maps an audience to a published finite layout/schema variant, scopes the binding to a normalized page/route (and optionally locale), and chooses an approved outcome event and attribution window. At request time the resolver combines the active membership with the current route/page and locale; those context values are never persisted as membership or customer traits. Version/audit rule and binding changes; each served decision records audience/rule version, page/locale, experience/variant, and a server-issued decision ID so exposure and outcomes can be analyzed.

### Approved first-slice decisions

- First example: seed a `recent_buyer` definition triggered by a trusted `commerce.order.paid` activity; proposed 30-day expiry. The TTL belongs to the audience definition, not Commerce code.
- First event fields: tenant, verified subject user ID (nullable for guest), activity type/version, stable source-event ID, occurrence time, and a small validated Commerce fact payload. Do not include raw provider envelopes or unnecessary PII.
- Domain packages own activity semantics and register typed activity schemas only; they do not ship or auto-activate audience criteria. Tenant managers author/activate tenant-scoped rules. The seeded `recent_buyer` rule is a demo fixture, not a domain/platform default.
- Anonymous users have no account lookup and receive the existing default experience. Do not add request-signal-based cohorts or anonymous hash assignments.
- For signed-in visits, resolve route/locale normally. An active membership plus an explicit published audience→experience binding selects a finite experience; otherwise use the existing default. Do not create per-signal/per-user segment keys.
- Log the selected experience with trusted audience/definition/variant dimensions; measure server-served and client page-view counts plus a server-trusted goal event within a proposed 30-day attribution window. Do not add email/name to new attribution dimensions or expose user-level records in this report. Results are observational because this design has no randomized holdout.
- Optional-auth route: no credential remains anonymous; supplied invalid credential should fail closed with 401. Confirm this policy.
- Audience membership is only an experience-targeting/analytics cohort. It never grants API permissions, paid access, discounts, price overrides, or other benefits. If spend must grant a privilege, implement a separate server-enforced entitlement policy that consumes trusted Commerce facts; that is outside this plan.

## 5. Step-by-step implementation phases

The user approved the implementation scope after reviewing this plan. Phases 1–6 were implemented as one capability; provider-backed checkout and a populated shopper journey remain untested locally because no real provider credentials or Audience fixtures were available. The checklist below is retained as the acceptance record; unchecked items require environment-specific follow-up.

### Phase 0 — Approved product and consistency contracts

Implementation followed these approved choices, with the concrete measurement threshold recorded below:

1. Implement a generic platform audience definition/evaluation/lifecycle engine; `recent_buyer` is one seeded rule, not hard-coded Commerce behavior. The demo tenant's proposed expiry is 30 days.
2. Identity comes only from a worker-verified JWT signed through current HMAC headers; request bodies, query parameters, cookies, local JWT decoding, and flags are not authority.
3. The complete capability includes tenant-admin rule and experience-binding UI/API. Never expose public membership assignment or raw activity-ingest routes. Use the existing `TENANT_MANAGE` permission unless the approval review specifies a narrower permission.
4. Assignment must persist before the durable provider receipt/job completes. If processing fails after machine state becomes `paid`, provider retry replays the same typed activity idempotently.
5. The machine hook is post-persistence. The complete consistency contract is durable provider receipt plus awaited post-persistence projection/activity processing, idempotent platform receipts, and replay/recovery for failures after machine state changes. This yields replay-safe eventual consistency rather than one SQL transaction across machine state, Evidence, and audience storage; implement and test that contract end to end. If eventual consistency is unacceptable, resolve that product requirement before approving this plan; do not leave the consistency contract unresolved.
6. Checkout redirect may precede the signed provider callback. Tests wait for persisted `paid` and refreshed schema before asserting the new experience.
7. Keep rule operators and activity payload fields allow-listed and schema-validated; no arbitrary code, SQL, or user-defined activity schemas.
8. Measurement is targeted experience + observational analytics (selected); the goal is a trusted registered activity, attribution windows are binding-configured from 1–30 days (30-day UI default), identity joins use verified accounts server-side, and the account-level outcome rate uses distinct rendered accounts as its denominator. Suppress all metrics below 10 distinct exposed accounts and suppress outcome counts/rates below 10 distinct outcome accounts. This design has no randomized control group and makes no causal-lift claim.
9. Keep all Commerce machine/order types out of the platform audience core. Commerce is the reference activity producer; the platform engine and activity registry must accept typed activities from independent domain modules under the same contract.
10. Before code or data migrations, inventory deployed flag targeting rules, evaluation-data/report consumers, analytics dashboards, and documented external clients that use `contextHash`. This repository audit did not inspect runtime tenant data. Map each active segment rule to a named audience or typed property, explicitly retire rules that have no recoverable meaning, choose verified-account/anonymous-session/global evaluation-subject semantics for percentage flags, and define analytics dimension mapping plus historical retention. Do not remove compatibility contracts until the migration checks pass.
11. Approve the behavior change from the existing common `contextHash = "default"` percentage bucket to the selected evaluation-subject policy; choose parity/dual-read validation and privacy-safe evaluation-record fields. A deterministic hash may remain inside the bucketing implementation, but the request-signal `contextHash` field and client-controlled cohort input are removed.

**Exit:** explicit approval of audience expiry, invalid-token behavior, cart ownership, event reliability, experience default, observational attribution/privacy, deployed-rule mapping, evaluation-subject semantics, analytics history/retention, and the flag bucketing migration.

### Phase 1 — Establish a trustworthy reference producer (Commerce only)

These cart/payment changes make the Commerce reference producer trustworthy for the `recent_buyer` example; they are not dependencies of the platform audience engine. Keep the audience core free of Commerce machinery. The generic registry/evaluator must also be verified with an independent non-Commerce activity schema, proving other domain modules can use the same platform contract without Commerce-specific branches.

**`packages/server/src/domains/machines/routes/instances.ts`**

- Authenticated `/cart/start`: derive `ownerUserId` from verified `getUserId(c)`; ignore client-supplied owner/guest flags and require a verified actor for an owned cart.
- Anonymous publishable-key start: force guest semantics and remove owner claims.
- Claim: derive owner from verified actor; ignore/reject body identity; preserve one-time claim and conflict on a different existing owner.
- Prevent event params from overwriting reserved machine context fields (`ownerUserId`, `guest`, or equivalent server-owned fields).
- Check ownership on authenticated reads, updates, and checkout so a known cart UUID does not let another account read or mutate a cart; preserve intended guest claim behavior.
- Allow only supported client cart events; reject `PAYMENT_SUCCEEDED` and `PAYMENT_FAILED` from browser/publishable-key HTTP calls. Trusted provider worker continues through the machine engine.

**`packages/server/src/domains/capabilities/routes.ts`, `packages/workers/src/routes/{proxy.ts,public-routes.ts}`, `packages/verticals/src/commerce/capabilities.ts`**

- Preserve publishable-key guest checkout and define optional JWT handling for signed-in `commerce.checkout`; validate supplied credentials and HMAC-sign actor identity.
- Bind authenticated checkout to the stored cart owner; reject actor/cart mismatch. Make guest checkout rules explicit.
- Never treat raw origin `Authorization` as authenticated actor identity.

**`packages/extensions/src/commerce/cart.ts`**

- Remove `sessionSub()` as authority and stop sending `ownerUserId` in the claim body. Keep auth headers; the server binds identity.

**Tests**

- Add `packages/server/src/domains/machines/routes/instances.test.ts`: server-derived start/claim owner, spoofed owner, cross-account read/update/checkout denial, guest claim, and attempts to invoke provider-only events.
- Extend `packages/server/src/domains/capabilities/routes.test.ts` and `packages/verticals/src/commerce/capabilities.test.ts` for optional auth, publishable key, and owner mismatch.

**Exit:** a client cannot establish/change an owner or mark a cart paid; intended guest checkout/claim continues to work.

### Phase 2 — Build the reusable platform Audiences domain

Do **not** add audience membership, rules, or experience bindings to the existing Context domain, and do not make its signal hashes a dependency. The new `audiences` domain owns definitions, durable activity processing, membership lifecycle, experience bindings, and management authorization.

**New platform domain: `packages/server/src/domains/audiences/`**

- `schema.ts`: add tenant-scoped `audience_definitions` (stable identity/current status), immutable `audience_definition_versions` (registered activity type/version, allow-listed condition tree, assign/remove semantics, expiry/revocation policy, creator/version metadata), versioned `audience_experience_bindings` (audience + normalized page/route scope + locale policy → published schema/layout variant, allowed goal event, attribution window), `audience_activity_receipts` (unique `(orgId, activityId)` idempotency key and resumable processing status), materialized `audience_assignments` (opaque text `userId`, audience key, source activity ID, definition version, assigned/expiry/revocation timestamps, unique current membership and active lookup indexes), append-only `audience_assignment_history`, and `audience_audit_log` tables. Keep only validated minimum facts and retention-bounded receipt data; never persist raw provider envelopes or unnecessary PII.
- `ports.ts`: typed `DomainActivity`, `ActivityTypeRegistry`, rule-definition CRUD/activation, durable activity receipt, assignment lifecycle, and active membership lookup contracts. Domain activities carry tenant, stable source ID, registered type/version, optional verified subject user ID, occurredAt, and validated typed facts.
- `activity-registry.ts` (new): register event schemas from owning verticals; validate type/version/payload before matching any policy. Conditions can inspect only registered fields and a small explicit operator set (equality, membership, safe numeric/date comparisons as justified), never arbitrary code, SQL, or JSONPath.
- `service.ts`: implement definition validation/version activation, generic activity matching, assign/remove actions, stable idempotency, assignment expiry, active lookup, and audit. Compute `expiresAt` from the rule expiry and trusted activity `occurredAt`; lazy expiry filtering at read means no timer job is required for membership to stop applying. For account audiences, do not assign when `subjectUserId` is absent. A definition update affects activities processed after activation; historical backfill is explicitly outside the complete capability's contract.
- `adapters/postgres.ts`: implement persistence and transaction/idempotency boundaries. Persist a receipt before reporting activity processed; atomically apply membership + history and mark the receipt complete, and safely resume incomplete receipts on provider retries. Keep assignment updates tenant-scoped. Receipt retention and privacy limits must be specified; completed receipts must remain available for the agreed replay-dedupe window.
- `api.ts` plus `routes/definitions.ts` (new): expose protected `GET /api/audiences/activity-types` metadata for the UI (registered event names, versions, safe fields/operators), `GET/POST /api/audiences/definitions`, `GET /api/audiences/definitions/:key`, `POST /api/audiences/definitions/:key/versions`, `POST /api/audiences/definitions/:key/versions/:version/validate`, `POST /api/audiences/definitions/:key/versions/:version/activate`, and archive/deactivate operations. Expose separate versioned experience-binding routes under `/api/audiences/definitions/:key/experience-bindings` to map a rule to a normalized page/route scope, optional locale scope, currently published schema/layout variant, and approved goal event/attribution window. Require `PERMISSIONS.TENANT_MANAGE` on every management operation. Validation/dry-run may accept an admin-supplied sample payload only to return a non-persistent match result; it must not create activity receipts or write memberships. Do **not** expose an HTTP route to create assignments or inject raw activities; activity ingestion is an internal typed port.
- `index.ts`: construct adapter, registry, service, and protected routes; expose the internal service to trusted bootstrap wiring.
- `packages/server/src/bootstrap.ts`: instantiate the domain once, mount `/api/audiences`, and make only its internal typed activity/read ports available to trusted domain wiring and Edge. Never mount activity ingestion as a public route.
- Add schema module to both `packages/server/src/drizzle.ts` and `packages/server/drizzle.config.ts`.

**Definition/lifecycle contract**

- A rule binds one or more registered activity types to safe conditions and actions, e.g. `commerce.order.paid` + `order.status == paid` → assign `recent_buyer` for 30 days. Tenant managers create/activate each tenant's criteria; domains register schemas only and supply no default rules. `recent_buyer` is seeded only as a demo-tenant example. A definition can have one active version at a time; one stable key is unique within a tenant.
- Expiry policy is explicit: bounded duration from activity occurrence time, or `untilRevoked` only when a registered revocation event/action exists. The platform implements both assign and revoke semantics; the Commerce reference integration publishes only the trusted activities included in this plan.
- Definition versions are immutable once activated. The UI/API create a new draft version to change predicates/expiry; assignments record the version that caused them. Disabling a definition stops future assignments; existing assignments retain their recorded expiry unless explicitly revoked. Activation does not backfill historical events; historical replay/backfill is an explicit non-goal, not unfinished implementation work.
- A late/replayed event uses its stable activity ID and occurrence time. Duplicate processing cannot extend TTL repeatedly; a distinct qualifying purchase can refresh/extend membership according to the active rule.

**Definition API/UI support files**

- Reuse existing admin route/page patterns: add `/admin/settings/audiences` → `template: "admin_audiences"` in `packages/client/src/platform-routes.ts`; add the `audiences` route ID guarded by `TENANT_MANAGE` in `packages/client/src/auth/admin-routes.ts`.
- Add API client `packages/client/src/admin/audiences.ts`, a component such as `packages/client/src/admin/components/audiences/AudiencesAdmin.tsx`, and definition editor/form helpers. The UI lists drafts/active versions and lets an authorized tenant manager configure the typed trigger/condition, assign/remove action, expiry, normalized page/route and optional locale scope (from registered request-context fields) for the published experience binding, approved goal event/attribution window, validation/dry-run, activation, and archive. Offer only activities registered by enabled modules, declared fields/operators, published experience variants, and approved goal events; do not pre-populate or activate domain-owned audience criteria. No executable expressions or raw activity submission. Show an observational performance summary (served/exposed count, outcome count/rate) with a clear no-control/no-causal-lift notice.
- Wire the UI through `packages/client/src/admin/registry.ts`, `packages/client/src/admin/schemas/components.ts`, `packages/client/src/admin/schemas/actions.ts`, `packages/client/src/core/admin-state.ts`, `packages/client/src/core/actions/audiences.ts` (new), and `packages/client/src/core/actions/index.ts`.
- Add `adminAudiencesSpec` and its `admin_audiences` layout upsert in `packages/seeding/src/profiles/platform/demo-specs.ts` and `index.ts`; add the settings nav item and label in `demo-labels.ts`. Follow the existing `adminFlagsSpec` / `FeatureFlagsAdmin` pattern. Use existing `TENANT_MANAGE`; introduce a narrower permission only if the approved authorization contract requires it.
- `packages/server/src/domains/audiences/service.test.ts`, `activity-registry.test.ts`, `routes/definitions.test.ts`, plus client component/API tests: register independent Commerce and non-Commerce fixture activity schemas and evaluate tenant rules through the same engine (no domain-specific branch); also verify invalid schema/field/operator rejection, tenant isolation, version activation, expiry from occurrence time, duplicate idempotency, revoke semantics, permission denial, dry-run immutability, and UI rejection of unregistered activity types.

**Replace request-signal targeting and migrate flag/analytics `contextHash` contracts**

- Stop ordinary storefront clients from choosing a segment for experience targeting. Never accept a browser `segment`, `tier` cookie, or `contextHash` as audience identity, membership, or experience-binding authority. Keep the normal server-side default-layout fallback.
- **Implemented:** removed the old request-signal Context runtime/routes and its event publishers; deleted the unused resolver/cache/service code. Kept the `segments`/`context_cache` Drizzle table mappings under `domains/legacy-context/schema.ts` so existing rows survive additive pushes; destructive retention cleanup is not part of this change.
- **Implemented in source:** flag evaluation now uses server-derived `audienceKeys`, allow-listed typed properties, and an explicit `evaluationSubject`; public routes reject legacy hash/segment aliases. The remaining production follow-up is to inventory deployed rules and approve mapping/retiring opaque legacy rules without guessing their semantics.
- **Implemented in source:** active analytics contracts and clients use named dimensions and trusted server attribution; the old field/grouping path is absent from current code. Historical ClickHouse data/columns and external reports remain until the approved retention/consumer review; no volume was reset.
- **Implemented:** Edge builds `ExperienceRequestContext` from normalized page/route and locale and passes it separately from verified identity and active memberships; it no longer calls a request-signal resolver.

**Exit:** source-level old request-signal/flag/analytics contracts are removed; tenant-authored rules and route/locale-scoped bindings use explicit audience and experience contracts. Deployment-specific rule mapping, historical consumer/retention checks, and populated browser journey remain follow-up.

### Phase 3 — Publish typed domain activities and evaluate them generically

**`packages/verticals/src/commerce/activity-types.ts` and `activity-projection.ts` (new), `index.ts`, `order-projection.ts` and tests**

- Register a versioned `commerce.order.paid` activity schema with only the needed facts. Add a Commerce-owned adapter that reacts only to authoritative `PAYMENT_SUCCEEDED` on the cart machine and emits that typed activity. It supplies the verified owner from server-established machine context, tenant, a deterministic ID for the actual domain transition (not a webhook delivery ID), trusted occurrence time, and the small validated fact payload.
- This adapter describes Commerce facts only. It must not name `recent_buyer`, choose an audience, or contain an expiry duration.
- Keep the existing order Evidence projection authoritative and independently idempotent; a domain activity is a typed fact, not an audience assignment or alternate order ledger.

**`packages/server/src/bootstrap.ts`**

- Construct the audience domain before machine hook registration. Register Commerce activity schemas and inject the platform activity port into the Commerce adapter.
- Compose the existing awaited transition hook with order projection and activity publishing before notification early-return logic. The platform audience service validates/records the activity, matches active rules, and updates whichever memberships apply before the provider receipt is completed.

**`packages/server/src/domains/integrations/provider-event-worker.ts`**

- Add recovery for a failed event/projection retry: if the durable provider event corresponds to the same expected cart already in `paid`, rebuild/replay the same stable typed activity from persisted machine/event context and let the platform receipt resume incomplete rule processing; do not attempt another final-state transition. Preserve completed duplicate suppression and verify machine/state/event correlation.
- Add `provider-event-worker.test.ts` covering failure after machine persistence, retry recovery, repeat delivery, and unrelated paid carts.

Do not subscribe to generic `MachineEvents.TRANSITION` or local/Redis `eventBus` for these critical writes; neither is durable. Use the awaited machine hook plus provider receipt/BullMQ retry path, backed by idempotent platform activity receipts.

**Tests:** add `packages/verticals/src/commerce/activity-projection.test.ts` and platform audience activity-processing tests; extend `order-projection.test.ts`. Verify typed event content, verified owner, guest/unowned and wrong-machine behavior, no audience key/TTL in Commerce adapter, rule-driven assignment, expiry from activity occurrence time, duplicate activity idempotency, and replay.

**Exit:** Commerce emits a valid typed fact independent of any audience definition; activating a platform rule can cause the generic engine to assign a membership, and retry cannot duplicate or lose it.

### Phase 4 — Serve the bound experience and measure observed outcomes

**`packages/workers/src/routes/{proxy.ts,public-routes.ts}` and possibly `auth.ts`**

- Give public schema GET explicit optional-auth semantics: anonymous without credentials; validate supplied credential and sign verified identity through HMAC. Distinguish missing token from invalid token (`tryParseJwt()` returns null for both); recommended invalid-supplied token result is 401.
- Apply equivalent deliberate behavior for signed-in `commerce.checkout`, retaining publishable-key guest calls; do not require login for unrelated public routes.
- Do not forward hashed signals, cookies, user agent, referrer, or country for audience targeting. The normal normalized page/route and locale resolve as today; separately pass only verified identity for account membership lookup. No other request signals are part of this complete implementation.

**`packages/server/src/domains/edge/{api.ts,ports.ts,service.ts,index.ts}`**

- Read `getUserId(c)` only from verified HMAC middleware; pass identity separately from query/body options. Ignore user/audience/owner claims in body/query.
- Define a typed `ExperienceRequestContext` and request-context field registry with field source/provenance, normalizer, privacy classification, and allowed operators. Register normalized page/route key and locale for this implementation; binding validation and admin UI may use only registered fields. Do not pass through arbitrary headers, cookies, or raw URL/query.
- Resolve route/locale normally and build that normalized request context. For an authenticated member, load active membership and select a versioned experience binding only when its page/route and locale scope match; verify the referenced schema/layout variant is published and compatible with that page. Otherwise use the normal default. Define deterministic priority/tie behavior if multiple bindings match. Preserve editor preview behind existing authorization.
- Emit a server-owned `experience.served` analytics event from the actual resolver decision, carrying audience key/rule version, normalized page key/locale, binding version, selected schema/variant, server decision ID, timestamp, and verified subject ID only where allowed by analytics privacy policy. Use the decision ID as a stable idempotency key. A matching client `page_view` remains a client-reported render signal; never trust client-supplied audience, membership, or rule-version metadata.
- Remove `segment=default` from ordinary storefront requests so the server decides. Preserve authorized editor preview behavior; refresh schema on in-place login/logout/account switch. Do not query order history or call AI per request.

**Feature-flag context migration: `packages/server/src/domains/flags/{ports.ts,evaluation.ts,service.ts,routes/evaluate.ts,routes/crud.ts,schema.ts,adapters/postgres.ts}` and browser SDK callers**

- Replace `FlagEvaluationContext.contextHash` with an explicit `evaluationSubject`, typed allow-listed `contextProperties`, and server-derived `audienceKeys` where a flag intentionally targets a named platform audience. Keep flags as release controls; membership remains stored and evaluated by the Audience domain, not in flag rules.
- Resolve trusted audience membership from verified identity on the server. Ignore any browser-supplied audience key or membership claim. Use explicitly non-authoritative client presentation fields only where the flag policy allows them.
- Migrate stored `segment`/`segment_group` conditions to named audience conditions or typed property predicates. Keep percentage rules, but compute their deterministic bucket from tenant + flag + explicit evaluation subject + seed. Define authenticated account and anonymous-session behavior, avoid persisting raw identities, and review that changing the ordinary `default` context can change prior bucket assignments.
- Replace flag-evaluation storage/query filters on `contextHash` with the approved privacy-safe evaluation metadata. Add migration and parity tests for active stored rules; remove the old API/schema/index fields only after all rules and consumers migrate.

**`packages/server/src/domains/analytics/{ports.ts,service.ts,api.ts,routes/ingest.ts,routes/query.ts,routes/audience-performance.ts,adapters/clickhouse.ts}` and analytics SDK/client helpers**

- Reuse the existing analytics pipeline (`variantId`, browser `page_view`, server events, and current conversion aggregates), but extend its typed dimensions/ingest contract and query to attribute results by audience key, audience-rule version, experience-binding version, normalized page key, locale, schema/variant, and time window. Carry stable idempotency keys (decision ID for served events, source activity ID for outcomes) and deduplicate them in aggregate queries. Replace the `contextHash` analytics field/filter/grouping with named, typed dimensions; migrate consumers and preserve historical events only through the approved retention/access period. Public frontend ingest must strip/ignore reserved audience, rule, binding, and decision dimensions; only server-generated served decisions and trusted server-source goal events count toward the trusted performance rate. Existing conversion reporting groups only by variant/schema and is not enough to distinguish audience effectiveness.
- Count a configured, trusted domain event as an outcome only when it occurs after a served decision and within the binding's approved attribution window; the event that originally qualified a user before they saw the experience cannot count as its outcome. Define a deterministic attribution policy (recommended: most recent prior served decision for the same verified account and matching audience/variant). Publish outcomes from the durable typed-activity/provider processing path, not the local/Redis event bus; deduplicate by stable source activity ID. Do not use raw email or client-claimed identity/cohort.
- Add `routes/audience-performance.ts` and register it from analytics `api.ts`; expose an `ANALYTICS_VIEW`-protected aggregate such as `GET /api/analytics/audiences/:key/performance`. Return only served/page-view counts, unique exposed accounts, unique accounts with at least one attributed goal outcome, and the resulting account-level rate—not user-level rows. Keep raw outcome-event totals separate, align retention with existing analytics retention, and suppress or warn on samples too small for interpretation.
- Add `fetchAudiencePerformance()` to `packages/client/src/admin/analytics.ts` for the admin summary. Extend existing analytics ports/service/ClickHouse query with typed audience/rule/binding dimensions and a trusted post-exposure outcome attribution query.

**`packages/client/src/admin/components/audiences/AudiencesAdmin.tsx` and analytics UI/API support**

- Show the performance summary beside the versioned experience binding: served/page-view counts, unique exposed accounts, unique accounts with a later goal event, account-level outcome rate, date range, and the explicit “observational—not causal lift” limitation. Hide metrics when the viewer lacks `ANALYTICS_VIEW`; definition editing still requires `TENANT_MANAGE`.
- Use `packages/client/src/platform/browser-observability.ts` to retain normal page-view telemetry with the server-resolved variant. Send only ordinary render telemetry from the browser; the server attaches trusted audience/binding/page/locale dimensions. Remove `contextHash` propagation from the browser SDK after flag evaluation uses server-derived typed context and analytics uses named dimensions. Never send audience membership claims or use the `tier` cookie as targeting authority.

**Tests**

- `packages/workers/src/routes/proxy.test.ts`: anonymous schema, valid optional JWT→HMAC user, invalid supplied credential policy, no raw token forwarded, guest capability preserved.
- Extend HMAC contract or add edge API test for signed identity and tampering.
- Add `packages/server/src/domains/edge/service.test.ts` and `api.test.ts`: anonymous/default, active audience binding matching normalized page/route + locale, no binding match fallback, expired/no membership, unpublished/incompatible variant fallback, registered request-context normalization, rejection of unregistered/arbitrary context fields, and proof that changing request context selects a binding without changing membership; also cover spoofing, preview authorization, and served-event attribution.
- Add feature-flag migration tests for server-derived audience/property context, rejected client membership claims, legacy `segment`/`segment_group` rule conversion, stable account/session percentage buckets, approved rollout-assignment changes, and evaluation-record privacy.
- Add analytics tests for audience/version/page/locale grouping, trusted outcome attribution/window, outcome-after-exposure ordering, duplicate served/outcome events, tenant isolation, permission denial, frontend spoofing of reserved audience/decision metadata, migration of old `contextHash` reports, historical retention, and suppression of user-level analytics output.
- Add client page-loader/observability tests for variant page-view attribution, absence of `contextHash` propagation, and login/logout/account switching.

**Exit:** a qualified account receives its configured published experience; anonymous/non-members retain the default; aggregated analytics report observed exposure and eligible outcomes accurately without implying randomized causality.

### Phase 5 — Deterministic demo fixture and cache isolation

**`packages/seeding/src/profiles/commerce/index.ts` and a focused `personalization-fixtures.ts`**

- Seed a visible published `recent_buyer` layout variant, the tenant audience definition, a versioned binding scoped to a demo page/route and supported locale, and the proposed trusted goal event/attribution window through the authorized API/service contract.
- Add a local shopper account without staff-team membership and a non-member comparison shopper (not a randomized control). Create presentation membership by processing a deterministic typed fixture activity through the platform Audience service, not by directly inserting an assignment. Seed a separate post-exposure goal event only for analytics-fixture testing; label it as fixture data, not provider proof.
- Make definition/binding/event/user seeding rerunnable and idempotent; use environment override conventions for local credentials and never log secrets.

**`packages/workers/src/routes/storefront.ts` and `renderer.ts`**

- Keep bot HTML anonymous; do not pass user identity into `personalizeSchema()` or use the site/path-only bot cache for account data.
- Keep `fetchSchema()` out of authenticated flow unless its cache key/policy is safe; current key omits user identity. Cache only by safe finite experience keys or bypass cache as appropriate.
- Test two-account separation and no leakage after logout/account switch.

Use the existing generic browser analytics/page-view support; adjust `packages/client/src/platform/browser-observability.ts` only to attribute page views to the server-resolved variant. Change `packages/browser-sdk` only if the existing `track`/`pageView` API cannot carry the approved safe metadata. Analytics records observed delivery/outcomes; it does not assign audiences or choose the page. No AI pipeline changes.

**Exit:** seeded accounts visibly exercise the configured variant with no user-private cache leakage; anonymous bot/default behavior remains unchanged, and a separate post-exposure fixture demonstrates aggregate analytics attribution.

### Phase 6 — Automated verification and acceptance

After approval and implementation:

1. Run focused tests for audience rules/activities, experience binding and analytics attribution, cart routes, Commerce projection/provider recovery, proxy identity, HMAC, edge schema, and checkout regression.
2. Run package typechecks for server, workers, verticals, client, extensions, and seeding; then root `pnpm typecheck`, `pnpm test`, and `pnpm build`.
3. Apply schema via `pnpm --filter @noname/server db:push`; verify indexes and expiry against local Postgres.
4. Start/seed Podman stack only after approval; run direct health/tenant checks and Browser MCP scenarios below.
5. Record tool evidence and distinguish automated, live browser, seeded-fixture, and provider-backed results. Do not report an unrun browser/provider flow as passed.

Acceptance checklist:

- [ ] Browser cannot set audience, owner, paid state, or protected provider transition.
- [ ] Authenticated cart ownership uses verified actor; other accounts cannot read/update/checkout it.
- [ ] Trusted paid callback emits a typed activity; an active matching platform rule assigns/refreshes membership with tenant/source/expiry; replay is safe.
- [ ] Activity-processing retry recovers after machine reaches `paid`; provider receipt completes only after matching rules and membership writes succeed.
- [ ] Tenant manager can author/validate/activate a versioned definition in the UI/API without arbitrary executable expressions.
- [ ] Anonymous, expired, unowned, and non-buyer requests default safely; authorized editor preview still works.
- [ ] Route/locale rendering remains unchanged; page/locale-scoped audience bindings select the published variant without signal hashes or tier cookies, while viewport adaptation remains responsive UI behavior.
- [ ] Request-context field registry is typed/allow-listed and extensible; unregistered fields are rejected, and changing request context never creates or changes audience membership.
- [ ] Analytics records server-served decisions and post-exposure trusted outcomes by audience/rule/binding/variant; deduplication, attribution window, and tenant isolation hold.
- [ ] Flag targeting uses verified server-derived audience keys/typed properties and an explicit privacy-safe evaluation subject; active legacy rules are migrated and approved rollout behavior is tested.
- [ ] Analytics filters/reports use named trusted dimensions; old `contextHash` records remain readable only for the approved retention window and no active consumer depends on the removed contract.
- [ ] Performance UI shows aggregate counts/rates, omits user-level PII, and labels results observational rather than causal.
- [ ] No cross-account cache leakage; logout/account switch removes prior experience.
- [ ] No online ML call or historical order query on the page hot path.
- [ ] Podman, schema push, seeds, API checks, Browser MCP, and console evidence are reported truthfully.

## 6. Package and ownership map

| Package/files | Planned responsibility | Boundary |
|---|---|---|
| `packages/server/src/domains/audiences/` (new) | Rule definitions, typed activity registry, receipts, assignments/expiry, experience bindings, admin API | Platform owns reusable matching/lifecycle; no domain-specific predicates |
| `packages/server/src/domains/legacy-context/schema.ts` | Keep historical segment/cache table mappings for safe additive schema operations | No runtime resolver/routes; drop only after approved retention and consumer review |
| `packages/server/src/domains/flags/` and browser SDK | Replace `contextHash` with server-derived typed targeting inputs and explicit evaluation subject | Preserve approved targeting intent; flags remain release controls, never the audience database |
| `packages/verticals/src/commerce/` | Register the reference Commerce activity schema and emit trusted `commerce.order.paid` facts | Commerce owns what happened; it does not choose audience or TTL |
| Other registered domain modules | Register typed schemas and publish trusted activities through the same platform port | No Commerce-specific branches or domain-supplied audience defaults |
| `packages/server/src/domains/machines/` | Trusted cart owner, cart access, browser event allow-list | Generic HTTP boundary; provider engine path remains trusted |
| `packages/server/src/domains/integrations/` | Provider retry/replay recovery | Durable ingress/receipts, not event-bus pub/sub |
| `packages/server/src/domains/edge/` | Combine verified identity, audience membership, page/route + locale context, and binding into finite experience/default; emit served decision | Server supplies typed flag context and evaluation subject; browser claims are never membership authority |
| `packages/server/src/domains/analytics/` | Record served decisions and trusted post-exposure outcomes; aggregate by audience/version/page/locale/variant | Replace `contextHash` with named trusted dimensions; retain historical rows only through approved retention |
| `packages/workers/src/` | Optional JWT and cache policy | Edge identity/transport; no audience rules or signal forwarding |
| `packages/client/src/admin/` and route/action/state files | Tenant-admin audience/experience editor and observational performance panel | Definition authoring/aggregate reading only; cannot assign membership or inject activities |
| `packages/client/src/platform/browser-observability.ts` | Attribute page views to server-resolved variants | Client render telemetry, not audience authority |
| `packages/extensions/src/commerce/` | Stop sending decoded owner claim | Caller only; server authority |
| `packages/seeding/src/profiles/{platform,commerce}/` | Rule/binding, layout, shopper, and metric fixtures | Admin API/domain ports; no raw SQL/public assignment API |
| Browser SDK, AI | Existing generic tracking only unless required by tests | No signals/cookies as audience inputs; AI does not own membership |

## 7. Test commands

The test paths marked new above are proposals, not tests that currently exist.

### Focused Vitest targets

```powershell
pnpm exec vitest run `
  packages/server/src/domains/audiences/service.test.ts `
  packages/server/src/domains/audiences/activity-registry.test.ts `
  packages/server/src/domains/audiences/routes/definitions.test.ts `
  packages/client/src/admin/components/audiences/AudiencesAdmin.test.tsx `
  packages/server/src/domains/machines/routes/instances.test.ts `
  packages/server/src/domains/integrations/provider-event-worker.test.ts `
  packages/server/src/domains/edge/service.test.ts `
  packages/server/src/domains/edge/api.test.ts `
  packages/server/src/domains/analytics/audience-attribution.test.ts `
  packages/server/src/domains/analytics/routes/audience-performance.test.ts `
  packages/server/src/domains/analytics/browser-ingest.test.ts `
  packages/server/src/domains/flags/evaluate-context.test.ts `
  packages/server/src/shared/hmac.contract.test.ts `
  packages/workers/src/routes/proxy.test.ts `
  packages/verticals/src/commerce/capabilities.test.ts `
  packages/verticals/src/commerce/checkout-flow.test.ts `
  packages/verticals/src/commerce/order-projection.test.ts `
  packages/verticals/src/commerce/activity-projection.test.ts `
  packages/server/src/domains/integrations/provider-event-receipts.test.ts
```

Then run:

```powershell
pnpm --filter @noname/server typecheck
pnpm --filter @noname/workers typecheck
pnpm --filter @noname/verticals typecheck
pnpm --filter @noname/client typecheck
pnpm --filter @noname/extensions typecheck
pnpm --filter @noname/seeding typecheck
pnpm typecheck
pnpm test
pnpm build
```

Run targeted Biome checks on changed files; if `pnpm check` reports pre-existing unrelated formatting/import issues, report those separately rather than widening scope.

## 8. Podman Compose and Browser MCP runbook (post-approval only)

This end-to-end verification runbook is a required completion check after implementation approval; no stack or test was started while drafting this plan.

### Destructive reset warning

The clean `noname-dev` procedure runs `podman compose down -v`. **This deletes Postgres, Dragonfly, ClickHouse, Zitadel key/database, and other compose volumes, erasing local test/demo state.** Back up needed data and get explicit confirmation before this reset. Do not run it merely to inspect a stack. If preserving data, use the existing stack and push the schema without `down -v`.

Stop only repo/target-port Noname API, edge worker, and client processes; do not kill unrelated Node processes. Do not start a replacement DSH GUI/server.

### Clean stack start and seed

From `C:\Workspace\noname` in PowerShell, only after reset approval:

```powershell
podman compose down -v
podman compose up -d
podman compose ps
curl.exe -sf http://localhost:8080/.well-known/openid-configuration
curl.exe -sf http://localhost:3003/health
pnpm init:zitadel
pnpm init:nango
pnpm --filter @noname/server db:push
```

Wait for Zitadel/Nango health; first Nango boot can take several minutes. `pnpm init:nango` is local/idempotent setup. **Do not run `pnpm init:nango:connect` automatically**: importing a real provider credential requires explicit user-supplied `CREDENTIAL_API_KEY` and provider setup. Never print secrets.

Start each app process in its own terminal/managed background job:

```powershell
pnpm --filter @noname/server dev     # API :3000
pnpm --filter @noname/workers dev    # edge worker :8787
pnpm --filter @noname/client dev     # client :5173
```

If needed, add `127.0.0.1 yogastore.localhost` to the Windows hosts file through an administrator-approved edit. Wait for ports 3000/8787/5173 to bind, then run:

```powershell
pnpm seed:demo:full
curl.exe -sf http://localhost:3000/health
curl.exe -sf http://localhost:8080/.well-known/openid-configuration
curl.exe -sf http://localhost:3003/health
curl.exe -sf http://localhost:3000/api/tenants/resolve/yogastore
```

### Browser MCP scenarios

Use registered `mcp__browser__*` tools. If unavailable, follow the `noname-test` skill: start Playwright MCP over SSE at port `8931`, initialize the MCP session, and keep it open for the complete flow. Do not claim visual checks from API responses or unverified screenshots.

1. Navigate to `http://yogastore.localhost:5173/`; verify the anonymous default experience.
2. Open `/login` as the seeded admin; navigate to `/admin/settings/audiences`. Verify tenant-admin rule/binding controls and the aggregate performance panel.
3. In the UI, create a draft rule from registered `commerce.order.paid` fields/operators, configure expiry, bind it to a published variant for a chosen page/route and supported locale, select a trusted post-exposure goal event and attribution window, validate/dry-run, and activate. Confirm invalid types/fields are rejected and no arbitrary expressions or activity injection are available.
4. Log in as the seeded non-staff shopper. Process the deterministic qualifying activity or complete a test checkout; visit the bound page in the selected locale and verify the membership selects the published experience, with `experience.served` and page-view analytics. Visit a route outside the binding and a locale outside its scope to verify the appropriate default/localized fallback; neither navigation changes the account's audience membership. Resize the viewport and verify the same experience adapts responsively without device-based audience or binding selection. The qualifying purchase happened before exposure, so it is not counted as this experience's outcome.
5. Process a separate deterministic trusted goal event after the experience was served and within the configured window. Verify the aggregate outcome count/rate updates for that audience/rule/binding/variant; confirm the UI labels the result observational and makes no causal-lift claim.
6. When a provider test connection is already configured: exercise the signed callback and provider retry path, then replay the callback and check no duplicate activity, membership, served decision, order, or outcome. A repeat purchase after exposure may count only if it falls inside the configured window.
7. If no provider test credential exists, do not connect one or claim live callback success. Run automated activity/rule/analytics attribution and provider retry tests; use typed seeded fixtures for storefront and metrics, and report the live provider flow as not run.
8. Log in as the non-member comparison shopper and verify the normal default (not a randomized control). Attempt client `segment=recent_buyer`/owner/cohort spoofing and provider-only cart event; verify none changes membership or experience. Switch accounts/log out and confirm no cache leakage.
9. As authorized staff/admin, verify `/admin` and `/?edit=true` editor/preview behavior; inspect browser console for new errors.

Capture Browser MCP snapshots and console logs plus direct API health, tenant, cart-state, and schema checks. Do not expose access tokens or provider secrets. Report automated tests, live browser checks, seeded-fixture checks, and unavailable provider tests separately.

## 9. Deployment-specific follow-up

The implementation was approved and completed in the local workspace. The following deployment-specific items remain:

- Inventory production tenant flag rules and external analytics consumers before migration. The code rejects opaque legacy segment/hash rules with an actionable migration error; no automatic meaning is inferred from old hashes.
- Select and verify production retention periods for legacy PostgreSQL/ClickHouse history. Local legacy fields and rows were preserved; this implementation did not delete historical data.
- Run the provider-backed checkout/callback/retry journey with approved credentials. No real provider connection was made in this local verification.
- For end-to-end shopper verification, create a non-production audience definition/binding and qualify a verified test account with a trusted activity; the demo tenant intentionally remains unconfigured, so its browser performance response is empty.
- Deploy the additive schema change through the environment's reviewed release process. The local Drizzle push was additive and did not reset Podman volumes.

The request-signal Context runtime/routes and `tier`-cookie targeting flow have been retired. The document `segment` field remains only as a layout-variant identifier. The current resolver uses normalized page/route and locale as transient request context alongside verified audience membership. Active flags use server-derived typed targeting plus an explicit evaluation subject; active analytics uses named trusted dimensions. Legacy PostgreSQL/ClickHouse fields and rows are preserved until tenant-rule, external-consumer, and retention reviews approve cleanup.

**Implementation status:** User approval was received. Core source and additive local schema are complete; the no-provider Browser MCP smoke and six reviewed Conventional Commits are published on `origin/main`. The active Context runtime is retired while legacy table mappings/data are preserved. A populated browser shopper journey, production tenant rule/consumer inventory, historical retention decision, and provider-backed checkout remain environment-specific follow-up.
