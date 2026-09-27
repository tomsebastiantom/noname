# `contextHash` and Platform Audiences — Code Audit and Migration Decision

> **Date:** 2026-09-26
> **Status:** Historical pre-implementation audit baseline. Use the companion plan for current implementation status and remaining deployment checks.
> **Related plan:** [`PERSONALIZATION-IMPLEMENTATION-PLAN.md`](PERSONALIZATION-IMPLEMENTATION-PLAN.md)

## Implementation status update — 2026-09-27

The recommendations below describe the pre-implementation code audit, not the current runtime contract. The active app now uses explicit flag evaluation subjects/typed properties and named trusted analytics dimensions; legacy request-signal resolver code/routes are retired. Legacy PostgreSQL table mappings remain only to preserve existing data during non-destructive schema operations. Production rule/consumer inventory and historical retention review remain open as described in the companion plan.

## 1. Executive finding

`contextHash` is an overloaded field used by three related but distinct mechanisms:

1. **Legacy request-signal segmentation:** the Context domain extracts request signals, hashes them, and can cache a visitor-to-segment association. The old Edge `/personalize` path consumes this result.
2. **Feature-flag evaluation:** Flags accept a context key for explicit segment matching and deterministic percentage bucketing. Existing flag evaluation records persist that key.
3. **Analytics:** browser events carry the key as an optional event dimension; the analytics store and API can filter or group by it.

The new audience system does **not** need any of these hashes to determine membership. It derives tenant-scoped membership from trusted, typed domain activities and verified account identity. However, deleting every `contextHash` field immediately would also change existing feature-flag behavior and remove an analytics dimension. Source code confirms those consumers exist; this audit has **not** inspected runtime tenant flag data or production analytics consumers, so it cannot confirm whether deployed configurations actively depend on them.

**Recommendation:** replace the old request-signal hash model and the overloaded `contextHash` contract with purpose-built inputs for each job. Do not substitute one new field everywhere: use audience membership for business cohorts, an explicit evaluation subject plus typed properties for flags, and named event dimensions for analytics. Migrate existing stored rules and reports, validate behavior, then remove the old `contextHash` fields and request-signal path as part of one complete migration. Never treat `contextHash` as an audience or trusted identity.

## 2. These terms do not mean the same thing

| Term | What it represents | Audience membership? |
|---|---|---|
| Request-signal hash / segment hash | Opaque fingerprint of extracted request signals; can vary with device, referral, country, cookie, and time | No. It is not a verified account and has no durable paid/activity history. |
| Feature-flag `contextHash` | A string supplied to flag evaluation as its segment/bucketing context; it may be `default` or a segment key | No. It controls flag rules, not platform audience assignment. |
| Analytics `contextHash` | Optional event field persisted and queryable as an analytics dimension | No. It is reporting metadata and may be client-reported. |
| Platform audience membership | Tenant-scoped, versioned derived state for a verified account, created by matching trusted domain activities and expiring/revoking by policy | **Yes.** This is the new eligibility/cohort concept. |

The new resolver instead combines verified membership with the normalized page/route and locale for a published experience binding. Those current-request fields do not create or extend membership.

## 3. What the current code does

### 3.1 Legacy request-signal segmentation

- `packages/server/src/domains/context/signal-extraction.ts` extracts device type/OS from `User-Agent`, referral category from `Referer`, country from `cf-ipcountry`, a `tier` value from the cookie, and a UTC time bucket.
- `packages/server/src/domains/context/service.ts` sorts and serializes signals, computes a SHA-256 digest truncated to 16 characters, resolves or stores a segment, and can cache a segment hash against a visitor ID. `engine.ts` contains a parallel implementation.
- The Context API is mounted at `/api/context`; its routes include `POST /resolve`, `POST /segment-from-request`, and `GET /segments`.
- `packages/server/src/domains/edge/service.ts` has a `personalize()` path that calls `segmentForRequest()`, uses the resulting hash to resolve a layout, and passes the same value to flag evaluation. `POST /api/edge/personalize` exposes that service path.
- The normal Edge schema path is different: `GET /api/edge/schema/:siteId` accepts a `segment` query parameter defaulting to `default`, uses it as a layout lookup key, and passes it to flag evaluation. The storefront loader currently sends `segment=default`; that default-layout fallback should remain server-controlled even if the browser no longer chooses a segment.

The request-signal hash is not a verified identity and is not anonymization: the segment table stores the extracted signal values, while the cache maps a visitor ID to a hash. User-agent, referrer, and cookie values can be client-controlled; the country header is trustworthy only if the deployment's proxy boundary guarantees it. The code does not turn any of these inputs into trusted account facts.

This request-signal path is the old mechanism the audience implementation does not need. It is still present in the code and its routes are mounted; this document does not claim it has already been removed or that external clients never call it.

### 3.2 Feature flags

- `packages/server/src/domains/flags/ports.ts` defines `contextHash` in `FlagEvaluationContext` and `EvaluationRecord`; supported conditions include `segment`, `segment_group`, and `percentage`.
- `packages/server/src/domains/flags/evaluation.ts` supplies `default` when the context is absent. A `segment` rule compares the supplied value to one hash; a `segment_group` rule checks a list; a `percentage` rule hashes tenant ID, flag key, context value, and seed to keep the same context in a stable rollout bucket.
- `packages/server/src/domains/edge/service.ts` passes the selected `segment` string to flag evaluation. The browser SDK also supplies its current context in the body of `/api/flags/evaluate`; this value is a targeting input, not an authorization credential.
- Flag evaluation records persist the context value in `packages/server/src/domains/flags/schema.ts`, index it, and allow the evaluations route to filter by `contextHash`.

**Why it exists here:** flag evaluation needs a stable context key for its current segment rules and percentage allocation. The old request-signal hash is one possible producer of such a key, but the flag evaluator itself accepts an opaque key and defaults to `default`. The key is not inherently a platform audience and must never grant access or privileges.

### 3.3 Analytics

- The browser SDK stores the current context value and attaches it to each analytics event (`packages/browser-sdk/src/index.ts` and `modules/analytics.ts`). `packages/client/src/platform/browser-observability.ts` updates that context from the Edge response. The frontend can submit the value, so it is not a trusted cohort assertion.
- The analytics event contract and ClickHouse table store nullable `contextHash` (`packages/server/src/domains/analytics/ports.ts`, `service.ts`, and `adapters/clickhouse.ts`). The analytics API can filter events by it and aggregate by it; the client analytics helper supports `groupBy: "contextHash"`.
- The generic analytics admin component does not currently present a dedicated `contextHash` column or selector. The code nevertheless stores the value and supports it in API/query contracts.

**Why it exists here:** it gives existing analytics a way to group events by the Edge context/segment key. It does not establish account membership or prove that a client-reported event belongs to a trusted business cohort; client-supplied values must not drive the new trusted performance rate.

## 4. What the new audience system adds—and what it does not

| Capability | Request-signal hash / `contextHash` | Platform audience system |
|---|---|---|
| Meaningful, named customer group | Opaque signal fingerprint or caller-supplied key | Tenant-authored, versioned rule over registered typed domain facts |
| Account continuity | Visitor cache may persist a signal-selected segment; not a verified business identity | Membership is attached to verified tenant/account identity |
| Qualification source | Request headers/cookies or a supplied context key | Trusted paid-order, subscription, or other registered domain activity |
| Lifecycle | No audience-rule expiry/revocation contract in the hash itself | Explicit expiry, revocation, rule version, audit, and idempotent processing |
| Experience selection | Legacy segment/layout lookup | Published binding combines membership with normalized page/route and locale |
| Outcome measurement | Generic event grouping by hash | Server-served decision plus trusted post-exposure outcome, attributed by audience/rule/binding/variant |
| Feature-flag rollout | Existing flag engine uses a context key for segment and percentage rules | Not a replacement for flags; release controls remain flag-owned unless separately redesigned |

The new system’s advantage is **explicit business meaning and trusted account lifecycle**, not that every use of the string field `contextHash` can be replaced by `audienceKey`. Audiences make targeting explainable, tenant-scoped, versioned, and tied to domain facts; experience analytics can report which audience/rule/binding was served and what trusted outcomes followed. Feature flags still solve a different problem: enabling/releasing software and maintaining deterministic percentage rollout.

### Recommended replacements by responsibility

| Current use | Explicit replacement | Important migration note |
|---|---|---|
| Request-signal hash chooses a customer experience | `audienceMembership` (`audienceKey`, active definition version, expiry) plus `experienceBinding` (`bindingId`, published `variantId`, page/locale scope) | Membership comes only from verified identity + trusted typed activity. No request hash or cookie participates. |
| Flag `segment` / `segment_group` rules compare opaque hashes | Typed flag properties and/or explicit `audienceKeys` supplied by the trusted server-side audience lookup | Existing stored rules need an inventory and mapping; not every old hash necessarily has a meaningful audience equivalent. |
| Flag percentage rule uses `contextHash` as its deterministic bucketing input | An explicit `evaluationSubject` such as `{ kind: "account", stableKey }`, `{ kind: "session", stableKey }`, or `{ kind: "global", stableKey }`; the evaluator derives a deterministic bucket from tenant + flag + subject + seed | Decide authenticated, anonymous, and global stability/privacy semantics first. Switching from the existing `default` context to per-account/per-session buckets changes rollout assignments. The subject is for flag rollout, not audience membership. |
| Analytics groups arbitrary events by `contextHash` | Named trusted dimensions such as `audienceKey`, `definitionVersion`, `bindingId`, `variantId`, normalized `pageKey`, and `locale` | Keep historical `contextHash` readable for the existing retention window; do not claim client-supplied hashes are trusted performance attribution. |

This is not a one-field substitution. It replaces each overloaded use with the data that actually expresses that use. A keyed/pseudonymous stable flag subject may still use a cryptographic hash internally for privacy or bucketing; that is different from hashing request signals into an audience segment.

## 5. Proposed complete replacement

All items below are required before claiming that the old `contextHash` system has been replaced. They form one complete migration, not a partial release with the remaining fields deferred.

### 5.1 Replace request-signal targeting with Audiences

- Remove request-signal extraction and `tier`-cookie interpretation for personalization, visitor-to-segment hash caching, and the old Edge `/personalize` path.
- After checking in-repository and documented external callers, remove the dedicated `/api/context/segment-from-request` and `/api/context/resolve` routes, legacy segment types/tests, and segment storage that have no separately approved purpose.
- Do not let a browser-supplied `segment`, `tier` cookie, or signal hash qualify an account or select an audience binding. Keep the default layout fallback server-controlled.
- Use verified identity + trusted typed activity + tenant rule version to create the explicit audience membership. Bind that membership to a published experience by binding ID/variant and normalized page/locale.

### 5.2 Replace `contextHash` in feature flags

- Replace `FlagEvaluationContext.contextHash` with purpose-specific fields such as `audienceKeys`, allow-listed typed `contextProperties`, and an explicit `evaluationSubject` used only for stable rollout bucketing.
- Derive `audienceKeys` and trusted properties on the server from verified identity/domain state; never trust client-supplied audience or membership claims at `/api/flags/evaluate`. Any deliberately client-controlled presentation property must be explicitly classified as non-authoritative and must not grant access.
- Migrate stored `segment`/`segment_group` rules to named audience membership or typed properties. Do not map opaque hashes to audiences unless their old meaning can be established; remove or explicitly rewrite untranslatable rules.
- Keep percentage flags deterministic using an explicit subject kind: verified account for cross-session signed-in stickiness, the SDK's anonymous session ID when per-session anonymous stickiness is desired, or an explicit global subject for system-wide evaluation. Use raw subject IDs only as server-side bucketing input; persist no raw account/session identifier. Define any pseudonymous evaluation token and its retention/privacy rule.
- **Important behavior change to review:** current ordinary Edge requests commonly use `contextHash = "default"`; those callers therefore share the same deterministic percentage bucket. Switching to account- or session-specific subject keys changes rollout assignments. Inventory deployed flag records and approve the desired rollout semantics before migrating.
- After rules are migrated, remove `contextHash` from the flag API/SDK context, evaluation records, database indexes, and filters; retain an evaluation subject type/key only if required and privacy-reviewed.

### 5.3 Replace `contextHash` in analytics

- Add explicit, server-owned experience dimensions: `audienceKey`, audience definition version, binding ID/version, published variant/schema, normalized page key, locale, and decision ID. Only trusted server events and verified post-exposure domain outcomes count in audience performance metrics.
- For any non-audience analytics use that still needs request context, use named, typed, allow-listed dimensions with source/provenance—not an opaque hash or arbitrary client-provided cohort claim.
- Migrate analytics API filters/grouping and consumer reports to these named dimensions. Keep old events readable during the existing retention period (the ClickHouse table currently has a 90-day TTL), then remove the `contextHash` column and query paths through a reviewed migration. Do not wipe volumes.

### 5.4 Verify and retire

- Search repository, seeds, tests, scripts, and documented external integrations for old `contextHash`, segment-hash, and `tier` contracts. The source audit found code paths, but did not query deployed tenant flag rules or analytics data; export/audit those before migration.
- Test flag-rule migration parity, deterministic bucketing under the newly approved subject policy, anonymous behavior, analytics report parity, trusted audience outcome attribution, route/locale binding, and removal of old endpoints.
- Remove compatibility fields/endpoints only after all in-repo and approved external consumers have migrated. Historical records should age out under retention; no destructive database reset is part of this work.

A stable evaluation subject may still be pseudonymous and a percentage allocator may still use a deterministic hash internally. That is not the old request-signal `contextHash` system: it does not turn headers/cookies into an audience or assert customer membership.

## 6. Decision and approval needed

The proposed end state replaces `contextHash` with three separate contracts: audience membership for business cohorts, an explicit evaluation subject and typed properties for feature flags, and named trusted dimensions for analytics. Before implementation, approve the flag rollout identity/bucketing behavior and the analytics historical-data migration after reviewing deployed tenant configuration. This code audit alone cannot establish which stored rules are active.

This document began as an impact analysis and migration proposal. The user subsequently approved implementation; local code changes, additive schema application, preserved-history checks, and provider-credential limitations are recorded in [`PERSONALIZATION-IMPLEMENTATION-PLAN.md`](PERSONALIZATION-IMPLEMENTATION-PLAN.md). No Podman volume reset or real provider connection was performed.
