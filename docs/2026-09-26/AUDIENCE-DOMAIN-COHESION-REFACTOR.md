# Audience Domain Contract Cohesion Refactor

**Created:** 2026-09-30
**Status:** Implemented; behavior-preserving contract refactor

## Purpose

Reduce the apparent and practical coupling of the Audience domain's single `ports.ts` file. Keep Audience as the owner of tenant-authored rules, durable membership, and experience attribution, while making each capability's contract explicit and allowing consumers to depend only on the capabilities they use.

This is a contract/module organization change. It must not change API payloads, database schema, membership semantics, experience selection, attribution, or the ownership of Commerce, Documents/Layout, Flags, Edge, or Analytics behavior.

## Current concern

`domains/audiences/ports.ts` currently defines activity registration, rule authoring, membership persistence, experience bindings, decision/render ledgers, and performance query contracts in one 311-line file. `AudienceService` then exposes all of those operations to every consumer, and `AudienceStorage` aggregates every persistence operation. As a result, Edge and authoring routes appear to depend on the entire personalization subsystem even when they use only a subset.

The broad file does not mean Audience replaces the other domains, but the contract shape obscures that boundary. This refactor narrows the contracts without creating another runtime domain or duplicating services.

## Ownership boundaries

- **Commerce and other producer domains** own their business state and register the trusted activity types/facts they publish. For example, Commerce projects a persisted paid-cart transition into `commerce.order.paid@1`; Commerce does not choose tenant audience names, membership expiry, or a layout variant.
- **Audience activity/rule capability** validates registered activity envelopes, exposes registered rule fields/operators, validates versioned tenant rules, and decides whether an activity assigns or removes membership.
- **Audience membership capability** owns the durable assignment lifecycle, expiry/revocation, activity idempotency receipts, and active-membership lookup.
- **Audience experience-attribution capability** binds an audience to a page/locale and a published layout segment, resolves matching bindings, and stores served/rendered/outcome decisions and their aggregate performance data.
- **Documents/Layout** continues to own published layouts and resolve a selected variant. An Audience binding stores references; it does not copy layout data.
- **Edge** continues request orchestration. It consumes membership and experience contracts, then uses the existing Layout, Flags, and Analytics services.
- **Flags** remains the runtime flag evaluator. A string layout segment is passed as a typed `layoutVariant` property, not as a UUID flag scope.
- **Analytics** remains the event storage/query domain. Audience performance aggregates are computed from the private decision ledger and exposed through the existing Analytics integration.

The Audience activity registry is not a replacement for the generic internal domain-event bus. It is a versioned, validated contract specifically for trusted facts that tenant-authored rules may inspect.

## Target contract modules

Keep these modules under `packages/server/src/domains/audiences/`:

1. `activity-rules.ts`
   - `DomainActivity`, activity field/operator metadata, registered activity type, and `ActivityTypeRegistry`.
   - Rule conditions, expiry policies, audience definitions and definition versions.
   - Narrow `AudienceRuleService` and rule/definition storage operations.
2. `membership.ts`
   - `AudienceAssignment`, `AssignmentChange`, and membership lookup/receipt contracts.
   - Narrow `AudienceMembershipService` and membership storage operations.
3. `experience-attribution.ts`
   - Experience bindings/request context/matches, decision dimensions and render inputs, outcomes, and performance dimensions.
   - Narrow binding-authoring, Edge delivery/render-confirmation, and measurement service interfaces, composed as `AudienceExperienceService`, plus experience-attribution storage operations.
4. `ports.ts`
   - A small composition/compatibility surface that re-exports the capability types and composes `AudienceService` from the narrow service interfaces and `AudienceStorage` from the narrow storage interfaces.
   - The composition root may continue to use the aggregate interfaces; feature consumers should use the narrowest interface they need.

The existing `createAudienceService` and `createAudienceDomain` remain the integration points. The service can continue coordinating capabilities and the PostgreSQL adapter can continue implementing the combined persistence adapter. This change does not require splitting database tables or adding independent runtime services.

## Consumer dependency changes

- Definition/rule routes depend on `AudienceRuleService` plus `AudienceExperienceBindingService`; Edge depends only on membership lookup and `AudienceExperienceDeliveryService`, not rule authoring, binding administration, or outcome measurement.
- Commerce keeps its local structural publisher port so `packages/verticals` does not depend on the Server package.
- The domain bootstrap and composition root may still use the full `AudienceService`/`AudienceStorage` facade.

## Example lifecycle

1. Commerce registers `commerce.order.paid@1`, including the allowed `order.status` field and its type/operator, and validates the exact fact shape.
2. A trusted persisted payment transition produces an activity with `orgId`, stable `activityId`, verified persisted `subjectUserId`, `occurredAt`, and `{ order: { status: "paid" } }` facts.
3. A tenant creates and activates a `recent_buyer` rule version such as `order.status equals "paid"`, with a bounded expiry. Audience validates the rule against the Commerce registration and records an idempotent membership change when the trusted activity arrives.
4. The tenant may separately bind `recent_buyer` to a published layout segment on `/` and optionally a locale. Without membership or a matching active binding, Edge keeps the default layout.
5. Edge resolves the published variant through Documents/Layout and records the private served decision. A render confirmation marks actual exposure; a later trusted goal activity may be attributed within the configured window.

## Compatibility and migration

- No HTTP route, JSON shape, database table, column, event name, layout ID, or attribution rule changes.
- Preserve `ports.ts` as a composition/re-export facade initially so remaining imports do not require a flag-day migration.
- Move type/interface definitions into the capability modules, then update internal producers/consumers to import narrow contracts.
- Keep service implementations and storage behavior unchanged; TypeScript and existing unit/integration tests are the behavior guard.
- Avoid circular runtime imports: contract modules should contain types/constants only where practical, and runtime imports should remain one-directional.

## Non-goals

- Do not create a second event bus, rule engine, audience domain, analytics domain, or layout system.
- Do not move Commerce-specific fact schemas or payment logic into Audience.
- Do not split `createAudienceService` into separate independently bootstrapped runtime services in this change.
- Do not alter the public Audience API, data retention, default-layout behavior, membership security, or production/provider integration.

## Acceptance checks

- Rule-authoring routes compile against the rule contract plus only their binding-authoring methods.
- Edge compiles against membership and experience-attribution contracts without importing the aggregate facade.
- Commerce's structural port remains independent of server implementation types.
- Existing Audience, Edge, Commerce activity-projection, and Worker regression tests pass.
- Server and Worker typechecks, server build, and formatting/whitespace checks pass.
