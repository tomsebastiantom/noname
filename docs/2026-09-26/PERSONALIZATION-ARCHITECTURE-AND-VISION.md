# Personalization Architecture and Vision

Date: 2026-09-26
Status: Architecture decisions are implemented in source; local verification and remaining provider-flow limitations are recorded below.
Pre-implementation baseline: [`AUTHORITATIVE-ROADMAP-CURRENT.md`](./AUTHORITATIVE-ROADMAP-CURRENT.md)
Approved implementation and verification record: [`PERSONALIZATION-IMPLEMENTATION-PLAN.md`](./PERSONALIZATION-IMPLEMENTATION-PLAN.md)

## Decision in brief

Personalization should combine **who the visitor is**, **what the platform has reliably learned about them**, and **what is true about this visit**. Keep these as distinct, typed inputs owned by the appropriate domains; do not collapse a person's identity and all their attributes into one segment hash.

A segment in the customer-personalization sense is better understood as an **audience assignment**: a server-derived, potentially time-limited relationship between an account and a named audience such as `recent_buyer`. It is not a user identity, a staff team, an authorization grant, or a unique segment for each person.

```text
Trusted domain events ──► update derived customer facts / audience assignments
                                       │
Verified identity ─────────────────────┤
Current visit context ─────────────────┤
                                       ▼
                         personalization decision
                                       │
                          shared layout / content
                                       │
                           exposure + outcome events
```

The core account-based Audience/Experience architecture is implemented in the current source and composed on the authenticated storefront path. The demo tenant remains unconfigured, so a populated browser shopper journey is still a verification follow-up; see the implementation plan for the verified limits.

## Concepts and ownership

| Concept | Answers | Examples | Source / owner | Persistence |
|---|---|---|---|---|
| Identity | Who is making this request? | Verified `orgId` + `userId`; anonymous visitor ID | Auth/session and trusted edge-to-origin identity | Stable account ID; never accepted as a trusted body claim |
| Events and facts | What happened, or what is known? | Paid order, product view, declared interest, saved locale | Owning domain (Commerce for orders; explicit user input for preferences) | Source event/fact remains authoritative in its owning domain |
| Profile traits | What stable or declared attributes are useful? | Preferred locale, shoe size, self-declared interest | Profile/preferences boundary, with source and editability explicit | Persist only useful, consent-appropriate values |
| Audience assignment | Which named cohort does this account currently qualify for? | `recent_buyer`, `running_shoe_interest` | Server-side rules or a later model, based on trusted facts | Tenant-scoped, user-linked, server-managed; can expire or be recomputed |
| Request context | What is true for this visit? | Device, referrer, current route, requested locale, time | Current request/browser and trusted edge headers | Usually transient; do not turn every visit into permanent profile state |
| Experience decision | What should this visitor see now? | Template, layout variant, offer, experiment arm | Personalization/experience resolver | Return a finite decision with a reason; keep access control elsewhere |
| Measurement | What happened after the decision? | Experience impression, click, conversion | Analytics/experimentation | Record the decision/variant with outcome events for evaluation |

A user can have several audience assignments at once. “Recent buyer” is a derived customer property, not an identity; “mobile” is usually current request context, not a durable audience. Staff teams remain an access-control concept and must not be repurposed as customer audiences.

### User-provided vs. server-derived data

- A person may edit preferences or answer onboarding questions. Preserve that provenance: these are **declared preferences**, not verified purchase facts.
- The client must not be able to assign itself `recent_buyer`, `VIP`, a plan entitlement, or a similar server-derived audience.
- Purchase, payment, and fulfillment facts come from trusted Commerce state/events. Derived memberships are written by trusted server code and exposed to the personalization resolver as read-only inputs.
- Audiences personalize experiences; they do not authorize access to protected data or operations. Authorization remains in the auth/permission path.

## Target runtime behavior

### 1. Update audience state from trusted actions

```text
Commerce confirms paid order
  → publish/invoke a trusted server-side audience update
  → deterministic rule evaluates the purchase fact
  → persist (orgId, userId, audienceKey, source, computedAt, expiresAt/version)
```

Start with a small deterministic rule such as `recent_buyer`. Do not run an LLM or a historical analytics query on each page request. For an experience that must change immediately after checkout, update the derived state before the checkout flow reports completion (or guarantee the update is processed before the next page read). A queued consumer is appropriate when eventual consistency is acceptable; state that freshness contract explicitly.

Commerce remains authoritative for the order. The audience record is a derived projection, not a second order database. A future model may suggest or compute assignments asynchronously, but its output should be versioned, explainable enough for operations, and persisted before request-time use.

### 2. Resolve a page using both customer and visit context

```text
Browser page/schema request
  → edge validates optional login token (anonymous still works)
  → trusted orgId/userId are signed to the origin
  → resolver loads the user's saved audiences/profile traits, if authenticated
  → resolver adds current request context (device/referrer/route/locale, etc.)
  → rules choose a finite experience/layout variant
  → edge resolves content and returns the spec
```

The hot path should do a small indexed membership/profile read (or a short-lived server-side cached read), not recompute purchase history or call an ML service. Current visit signals are evaluated separately. If the user has no account or no audience assignment, use the anonymous/default path.

### 3. Cache safely

- Keep layout variants reusable across people: cache by tenant + template + finite experience/variant key, never by raw `userId` as a substitute for a segment.
- Do not put per-user private data into a shared public cache. Resolve private state separately or use an appropriately private cache policy.
- Use bounded audience/variant combinations; avoid generating a unique layout key for every combination of user, device, time, and event.
- Do not treat a client-supplied `segment`, `userId`, role, or audience list as proof of membership. Publicly selectable display variants are not security boundaries.

## Current code: what exists and what does not

| Area | Current code truth |
|---|---|
| Authenticated identity | The worker can validate JWTs and sign identity for the origin in `packages/workers/src/routes/proxy.ts`. However, `/api/edge/schema/:siteId` is a public route, so the ordinary schema request currently skips JWT resolution and does not forward a trusted user ID through the signed identity headers. |
| Browser page request | `packages/client/src/platform/use-app-page-loader.ts` requests the schema with `segment=default`. It later sends the returned segment/flags to browser observability; that is not user-audience resolution. |
| Current context signals | `packages/server/src/domains/context/signal-extraction.ts` extracts device type/OS, referrer class, Cloudflare country, a `tier` cookie, and UTC time. The cookie is request input, not a trusted purchase fact. |
| Current segment storage | `packages/server/src/domains/context/schema.ts` stores signal-hash segments and a visitor-to-segment cache. It does not store `(orgId, userId, audienceKey)` assignments or customer profile facts. |
| Edge personalization | `packages/server/src/domains/edge/service.ts` resolves the request-signal hash to a layout. The 2026-09-12 implementation record scopes the live path to bot requests; normal browser delivery still starts from the R2 shell and default schema request. |
| Flags | The server supports `property_match`, but the browser SDK sends empty `contextProperties`. Public flag evaluation is not a trusted source for identity, purchase facts, or access control. Flags are suitable for feature/experiment decisions, not as the customer profile or audience store. |
| AI pipeline | `packages/server/src/domains/ai-pipeline/` generates layouts, content, and machines. It is not currently connected to purchase/event-based audience assignment or online personalization inference. |
| Observability | `packages/client/src/platform/browser-observability.ts` sets analytics/error user attribution and synchronizes flags. It should not own customer profile, audience assignment, or page-personalization policy. |

The 2026-09-12 edge record verifies request-signal forwarding and bot rendering scenarios, not authenticated customer-history personalization. The “complete for current local scope” label in the authoritative roadmap refers to that documented scope; see the clarification in [`AUTHORITATIVE-ROADMAP-CURRENT.md`](./AUTHORITATIVE-ROADMAP-CURRENT.md).

## Recommended implementation sequence

1. **Agree the vocabulary and contract.** Keep identity, profile traits, audience assignments, request context, experience decisions, and analytics events distinct. Prefer `audience assignment` in new API/domain names where “segment membership” could be confused with teams.
2. **Add one trusted audience vertical slice.** On a confirmed paid order, assign/refresh `recent_buyer` for the verified account. Include tenant scope and expiry or a recomputation policy. Do not build a generic editable profile product first.
3. **Carry optional identity to storefront resolution.** For a logged-in browser schema request, validate the token at the worker and sign the trusted identity to the server; preserve anonymous access. Never accept audience assignments from the browser.
4. **Resolve audiences plus request context.** Read the saved assignment cheaply, combine it with current request context, and return a finite layout decision with a safe default. Keep authorization independent.
5. **Prove correctness and cache isolation.** Test anonymous fallback; paid-order assignment; immediate/declared eventual freshness; logout/account switching; cross-tenant isolation; spoofed client fields; expiry; and that one user's private data cannot appear in another user's cached page.
6. **Add measurement before ML optimization.** Record which experience was actually served and link impression/conversion events. Add asynchronous model-based audience/variant optimization only when data volume and product needs justify it.

A minimal first design can add audience-assignment ports/storage alongside the existing context capability without making the browser SDK an identity authority or creating a broad customer-data platform. Keep the originating purchase logic in Commerce and the generic experience-resolution contract in the platform context/personalization boundary. Extract a standalone audience/profile domain only when multiple verticals need a genuinely shared lifecycle/API.

## Documentation reconciliation

- [`../2026-09-12/EDGE-PERSONALIZATION-IMPLEMENTATION.md`](../2026-09-12/EDGE-PERSONALIZATION-IMPLEMENTATION.md) is implementation evidence for the existing bot/request-signal path.
- [`../2026-07-27/FLAGS-PER-USER-TARGETING.md`](../2026-07-27/FLAGS-PER-USER-TARGETING.md) documents flag targeting capabilities and an older client-wiring proposal; do not interpret it as account-audience storage or page-personalization implementation.
- [`../2026-07-10/documents-domain.md`](../2026-07-10/documents-domain.md) contains useful historical design rationale for finite cached segments versus per-user state, but is marked stale and is not current code truth.
- Product pitch documents describe an aspirational ML optimization loop; they do not establish that event-to-audience or online inference pipelines exist.
