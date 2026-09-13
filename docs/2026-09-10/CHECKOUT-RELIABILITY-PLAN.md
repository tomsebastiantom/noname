# Checkout Reliability Implementation Plan

> **Date:** 2026-09-10  
> **Status:** Active — execute in order, one workstream at a time  
> **Goal:** Make checkout reliable without breaking the existing platform, guest-cart flow, XState API, or provider boundaries.

## Scope

This plan covers the current reliability path:

```text
browser/cart
  → generic capability route
  → trusted server pricing
  → durable capability idempotency
  → provider checkout through Nango
  → awaiting_payment machine state
  → Nango callback ingress
  → durable provider-event queue
  → normalized payment event
  → MachineEngine / ephemeral XState actor
  → persisted paid/payment_failed state
```

The work must preserve these existing boundaries:

- The browser never supplies authoritative price, currency, provider credentials, or payment status.
- The browser never calls Nango directly.
- XState is the only transition authority.
- BullMQ is used for durable asynchronous provider-event processing and retries.
- The event bus is notification fan-out only, never the sole business-critical delivery path.
- Generic server domains do not gain Stripe- or commerce-specific branches.
- Public checkout remains explicitly allowlisted and protected by tenant resolution plus publishable-key validation.

## Ordered workstreams

### 0. Establish a green baseline

**Implementation:** Fix the failing event-bus test and make local Redis/no-Redis behavior deterministic in tests.

**Verification:**

- `pnpm test`
- `pnpm typecheck`
- Focused event-bus tests with Redis available and unavailable
- Confirm no unrelated test count/regression changes

**Exit criteria:** Full test suite passes and the event-bus delivery contract is documented.

### 1. XState-authoritative machine execution

**Implementation:**

- Add pure JSON-to-XState normalization and validation.
- Preserve the existing machine definition/storage/API shape.
- Execute `start()` and `transition()` through ephemeral actors.
- Send exactly one event per transition.
- Read state/context only from the actor snapshot.
- Define the synchronous guard boundary explicitly; reject unsupported async guards rather than silently running them twice.
- Preserve existing audit, rejection, event, completion-hook, and persistence behavior.

**Verification:**

- Unit tests for valid/invalid definitions, initial state, final states, targets, guards, context, unknown events, rejected events, and actor cleanup.
- Assert each guard runs at most once.
- Existing machine-domain tests.
- Guest cart add, login claim, and owner-stamping tests.
- Server typecheck/lint.
- Live start → transition → reload → transition smoke test.

**Exit criteria:** Existing machine API remains compatible and no manual transition evaluator remains authoritative.

### 2. Durable capability idempotency

**Implementation:**

- Add durable storage for organization, capability, idempotency key, request hash, status, result/error, and retention metadata.
- Atomically claim a new key.
- Return the original result for an identical retry.
- Reject a reused key with a different request hash.
- Ensure provider idempotency keys are derived deterministically.

**Verification:**

- First request executes once.
- Identical retry returns the stored result without re-running the handler.
- Conflicting retry returns a validation/conflict response.
- Concurrent identical requests produce one execution.
- Expired records follow the documented retention policy.
- Database adapter and capability route tests.
- Typecheck/lint and migration/schema verification.

**Exit criteria:** A browser refresh or network retry cannot create duplicate checkout sessions.

### 3. Checkout and provider-event reliability

**Implementation:**

- Register the commerce checkout capability through the generic contribution boundary.
- Transition the cart only after provider session creation succeeds.
- Standardize `checkout_started`, `awaiting_payment`, `PAYMENT_SUCCEEDED`, and `PAYMENT_FAILED` behavior.
- Add durable provider-event receipt/deduplication records.
- Use deterministic queue job IDs based on provider connection and delivery/event ID.
- Normalize provider payloads into safe provider-neutral payment events.
- Route normalized events through `MachineEngine.transition()`.
- Keep malformed, unknown, and permanently rejected events observable without infinite retries.

**Verification:**

- Provider mapping unit tests for success, failure, malformed, missing-correlation, and unknown events.
- Queue retry and deduplication tests.
- Duplicate callback test proving one machine transition.
- Infrastructure failure retry test.
- No Stripe-specific code in generic machine/webhook/integration transport domains.

**Exit criteria:** Provider callbacks are durable, replay-safe, and cannot mark payment successful through the browser.

### 4. End-to-end checkout proof

**Implementation:** Add automated coverage for the complete guest and authenticated flow.

**Verification walk:**

1. Resolve a tenant and publishable key.
2. Start an anonymous cart.
3. Add a published product.
4. Confirm checkout derives price server-side.
5. Call checkout with an idempotency key.
6. Confirm hosted checkout URL and `awaiting_payment`.
7. Submit a provider-sandbox callback through Nango ingress.
8. Confirm durable enqueue and worker processing.
9. Confirm final `paid` state and persisted context.
10. Replay the callback and confirm no second transition.
11. Reload the instance and confirm state/context remain correct.
12. Repeat the relevant path for an authenticated cart and guest-cart claim.

**Exit criteria:** Automated or documented browser/API evidence covers the full callback-to-paid path.

### 5. Post-proof product work

Only after workstreams 0–4 are green:

- Extension-owned order projection/admin UI.
- Second-provider fixture.
- New-org provisioning automation.
- Production Keto deployment and A3 identity sign-off.
- Optional rate limits, coverage thresholds, and CI build enforcement.

## Non-regression contract

Every workstream must preserve:

- `pnpm typecheck`
- `pnpm test`
- Existing guest add → login → claim behavior
- Existing authenticated cart behavior
- Existing machine API response/storage contracts
- Existing public-access and publishable-key checks
- Existing Nango proxy credential isolation
- Existing admin/editor/auth flows
- Existing worker and server package boundaries

For runtime-affecting changes, run focused tests first, then the complete suite, then the relevant live/browser smoke path. Update the authoritative tracker with evidence and caveats before starting the next workstream.

## Current baseline

- Trusted server-side pricing: complete and verified.
- Capability idempotency: durable Postgres storage and route replay/conflict/retry handling are implemented; database push and live concurrent-request verification remain.
- Provider callbacks: durable receipt claim/deduplication and worker completion/failure updates are implemented; live Postgres/queue verification remains.
- XState actor execution: normalization and flat-state regression coverage are now implemented; live cart reload smoke remains before final sign-off.
- Full callback-to-`paid` E2E: not yet automated.
- Initial verification on 2026-09-10: `pnpm typecheck` passed; `pnpm test` had one event-bus timeout (`506 passed, 1 failed`).
- Workstream 0 is now complete: event-bus local delivery is deterministic and full verification is green (`141` files, `507` tests).

## Change log

### 2026-09-10 — Plan created

- Established ordered implementation and verification gates.
- Made event-bus baseline the first code change.
- Explicitly separated XState execution, capability idempotency, provider-event durability, and E2E proof.

### 2026-09-10 — Workstream 0 complete

- Fixed local event-bus delivery when Redis is connected.
- Added origin tagging to prevent same-process Redis loopback duplicates.
- Focused event-bus tests, full typecheck, and full test suite pass.
- No public event-bus API or cross-replica transport contract changed.

### 2026-09-10 — Workstream 1 implementation complete for flat-state machines

- Added pure machine-definition normalization and validation in `packages/server/src/domains/machines/machine-config.ts`.
- Engine definition loading/saving now validates through the normalizer.
- Actor construction consumes the normalized definition; target selection remains inside XState.
- Added normalization tests and engine tests covering guard call count, persisted reload, context updates, final state, and rejected events.
- Focused machine tests and server typecheck pass.
- Full verification after the implementation: `pnpm typecheck` passed, `pnpm test` passed (`146` files / `519` tests), and `pnpm build` passed. Build emitted existing bundle-size/import-meta warnings only.
- Remaining sign-off: full workspace verification plus live cart start → transition → reload smoke.

### 2026-09-10 — Workstream 2 implementation complete pending live database verification

- Added `capability_idempotency` storage with unique organization/capability/key identity, request hash, status, result, failure, and expiry fields.
- Capability routes now atomically claim keys, replay completed results, reject conflicting payloads, reject concurrent in-progress attempts, and release failed attempts for safe retry.
- Added route tests for replay, conflict, and retry behavior.
- Server typecheck and focused capability/machine tests pass.
- Remaining sign-off: apply the schema with `db:push` and verify concurrent requests against Postgres. Attempted on 2026-09-10, but Podman was unavailable (`127.0.0.1:59525` connection refused).

### 2026-09-10 — Workstream 3 implementation complete pending live queue verification

- Added durable `provider_event_receipts` storage keyed by connection plus provider event/delivery identity.
- Nango ingress claims receipts before enqueue and ignores duplicate deliveries.
- Provider-event workers mark receipts completed only after normalization and machine transition handling; failures are recorded and rethrow for BullMQ retry.
- Added schema registration and bootstrap wiring without adding provider-specific logic to generic transport.
- Added commerce capability tests for trusted amount calculation, checkout state event, success/failure mappings, and the in-memory checkout flow contract.
- Server/vertical typechecks and integration tests pass.
- Remaining sign-off: apply schema and verify real Nango → BullMQ → worker → machine behavior.
