# External Execution Layer Consideration

## Date: 2026-07-04

---

> **Framing — "commerce" is an example vertical, not the product.** The checkout/booking/refund examples illustrate the general external-execution pattern. The platform is **identity-agnostic** and the same Nango + BullMQ + XState approach applies to any vertical.

## Question

Should we add a Lambda/FaaS-like function infrastructure to serve as a fallback execution runtime when the XState machine engine needs external data or simple logic outside the state machine's scope?

## Context

Commerce state machines (bookings, checkouts, refunds, subscriptions) often need external data — shipping rates, tax calculations, inventory from third-party warehouses, payment status from Stripe, or sync with accounting systems like QuickBooks.

A state machine definition (pure JSONB) cannot natively:
- Call external HTTP APIs
- Handle OAuth token refresh
- Manage rate limits or retries
- Execute arbitrary business logic that doesn't fit into a state transition

The question is whether we need a separate serverless function infrastructure (Lambda-like / FaaS) for these cases.

## Decision: Not Needed — Already Covered

We do **not** need a dedicated Lambda/FaaS fallback infrastructure. The existing architecture already handles all external execution and simple logic cases through three complementary layers:

### 1. Nango — External API Integration Layer

Nango is the dedicated connector for all external services. It handles:
- 800+ third-party APIs through a unified interface
- OAuth token management, refresh, and scoping
- Rate limiting, retries, and backoff per integration
- Scheduling, checkpoints, and delta sync
- Error normalization and clean error returns to XState

The pattern (BUILD_PLAN.md:490-520):

```
XState orchestrates WHEN to call → Nango handles HOW to call
```

XState never stores API keys, never knows URLs, never manages retries. The machine definition stays pure JSON. Nango manages all external communication and returns clean data to the state machine.

### 2. BullMQ — Async Execution Layer

BullMQ handles side effects that should not block the request path:
- Email sending (order confirmations, booking confirmations)
- Calendar sync
- Webhook delivery
- Long-running external operations

Workers pick up jobs, execute external calls (often via Nango), store results, and the state machine can poll or receive callbacks.

### 3. User Functions (Planned Phase 2+)

Users can deploy custom logic to three runtimes:
- **Edge** (Cloudflare Worker) — per-request logic, <10ms
- **Server** (Hono route) — heavy logic, batch processing, <50ms
- **Client** (Browser) — UI-only transformations

These functions appear in json-render's action catalog and can be invoked from state machines as side effects or guard checks.

## Why Not Lambda/FaaS

| Concern | Already Solved By |
|---------|-------------------|
| External API calls | Nango (800+ APIs, auth, retries) |
| Async execution without blocking request path | BullMQ (Redis-backed, durable queues) |
| Custom business logic outside state machine | XState wrapper guards + side effects (TypeScript) + User Functions |
| OAuth/token management | Nango (built-in per integration) |
| Rate limiting and retries | Nango (built-in) |
| Simple data transformation | Catalog handlers + guard functions in TypeScript |

Adding a separate Lambda/FaaS layer would be redundant — it would duplicate capabilities already present in Nango, BullMQ, and the XState wrapper. The architecture was explicitly designed around the `XState orchestrates WHEN → Nango handles HOW` pattern to avoid needing a separate external function infrastructure.

## How External Execution Flows Today

### Flow: State Machine Needs External Data

```
XState machine reaches transition requiring external data
  → Our wrapper checks guard or invokes side effect
  → Nango fetches from external service (shipping API, tax API, QuickBooks)
  → Nango handles auth, retry, rate limiting
  → Clean result returned to XState machine
  → Machine transitions based on result
```

### Flow: State Machine Triggers Async Work

```
XState machine completes transition
  → Our wrapper queues side effect to BullMQ
  → Email (Resend), calendar sync (Nango), webhook delivery
  → BullMQ worker executes, handles retries, dead-letter on failure
  → Analytics event auto-logged per transition
```

### Flow: Custom Guard Logic

```
XState machine needs to check a precondition
  → Guard function written in TypeScript (not JSONB)
  → Example: query DB for slot availability, check inventory level
  → Guard returns true/false
  → Machine transitions or rejects
```

## Relevant Architecture Documents

- BUILD_PLAN.md:490-520 — XState + Nango orchestrator/integrator pattern
- BUILD_PLAN.md:350-398 — State machine engine with guards, side effects, BullMQ
- FINDINGS.md:95-125 — Nango as external API integration layer
- FINDINGS.md:205-214 — User functions runtime (Phase 2+)
- STACK.md:38 — Nango reference

## Future Consideration

If a future use case genuinely requires isolated serverless execution (e.g., customer-submitted code running in sandboxed environments, or compute-heavy ML inference that shouldn't share the API server), the architecture's domain boundaries support extraction. The machines domain could dispatch to a separate worker pool without redesigning domain logic. But for the current scope of external API calls, async side effects, and custom guard logic — the existing Nango + BullMQ + XState wrapper pattern is sufficient.

## Status

**Considered and deferred.** No Lambda/FaaS infrastructure needed for current architecture. Revisit if scale or sandboxed customer code execution demands it in Phase 3+.