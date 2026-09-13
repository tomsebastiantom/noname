# Checkout Reliability Implementation Details

> **Date:** 2026-09-12  
> **Purpose:** Detailed engineering record of the checkout reliability milestone. This is an implementation and verification document, not a pull-request summary.

## Commit ledger

| Commit | Conventional type | Detail |
|---|---|---|
| `7f04bd3` | `feat(checkout)` | Added the checkout reliability implementation: XState definition normalization, capability idempotency, durable provider receipts, authoritative checkout transitions, payment mappings, and regression coverage. |
| `845296a` | `fix(checkout)` | Added live Postgres concurrency evidence and fixed BullMQ custom job IDs so provider callback jobs cannot fail on `:` characters. |
| `3a53c86` | `docs(checkout)` | Recorded final Browser MCP, Stripe Sandbox, signed callback, duplicate suppression, build, and verification evidence. |

Earlier supporting commits also include conventional Nango startup work:

- `bcac167` — `feat: added nango to docker compose`
- `6fafe24` — `feat: added nango to skills`

## Detailed implementation changes

### Event bus

- Local handlers now receive an event before Redis publication.
- Redis remains the cross-instance fan-out mechanism.
- Each process has an instance ID so same-process loopback messages are ignored.
- The existing event-bus test now passes without depending on Redis timing.

### XState machine execution

- Machine definitions are normalized and validated before persistence or actor construction.
- Initial states, targets, actions, guards, and malformed definitions are checked centrally.
- XState remains the only transition authority.
- Actor start, persistence reload, guards, context updates, final states, and rejected events are covered by tests.

### Capability idempotency

- Added the durable `capability_idempotency` table.
- Claims are unique by organization, capability, and idempotency key.
- Identical completed requests replay their stored result.
- A different request body using the same key returns a conflict.
- Requests already processing return `in_progress`.
- Failed attempts can be retried.
- Request hashes use stable key ordering so JSON property order does not change identity.

### Provider callback receipts

- Added the durable `provider_event_receipts` table.
- Provider event identity uses the provider event ID, delivery ID, or deterministic payload hash.
- Duplicate callbacks are rejected before queueing.
- Receipts complete only after provider normalization and machine transition succeed.
- Failed processing is recorded so queue retry can safely recover.
- BullMQ job IDs are URI-encoded because BullMQ rejects custom IDs containing `:`.

### Commerce checkout

- Checkout transitions the cart machine using `checkout_started`.
- Browser prices are ignored as authority; pricing is resolved server-side.
- Stripe Checkout form data uses the server-derived amount and currency.
- Success, async failure, and expired-session provider mappings are registered.
- The legacy `checkout` cart event remains available for compatibility.

### Nango and webhook security

- Nango is included in the default compose stack.
- `pnpm init:nango` is idempotent and configures:
  - Nango admin setup
  - Nango environment secret adoption
  - Stripe integration configuration
  - Provider callback URL
  - HMAC webhook signing key
- The generated signing key is written only to ignored local environment files.
- `pnpm init:nango:connect` stores the provider credential in Nango and registers only the non-secret connection ID in Noname tenant settings.
- The application never receives or stores the Stripe API credential.

## Live verification evidence

### Infrastructure

- `podman compose up -d` — PASS
- `pnpm --filter @noname/server db:push` — PASS
- API health — PASS
- Edge worker health — PASS
- ZITADEL metadata — PASS
- Nango health — PASS
- Client — PASS

### Browser MCP

A persistent Chrome Playwright MCP session was used over SSE. The session performed:

- Storefront navigation — PASS
- Login form and admin login — PASS
- Admin dashboard — PASS
- Visual editor — PASS
- Product rendering — PASS
- Add to Cart — PASS
- Stripe Checkout navigation — PASS
- Stripe Sandbox payment with `4242 4242 4242 4242` — PASS
- Return to `/?checkout=success` — PASS
- Final post-concurrency login/storefront smoke — PASS

The only recurring browser error is the pre-existing `/favicon.ico` 404.

### Signed callback and XState

A locally simulated Nango callback was signed with the configured HMAC key and sent through the normal edge/API route:

```text
Stripe-shaped checkout.session.completed
→ Nango signature verification
→ provider receipt claim
→ BullMQ queue
→ provider normalization
→ XState transition
→ paid
```

Observed result:

```text
Machine state: awaiting_payment → paid
Payment reference: pi_local_test
Receipt: completed
```

Replaying the exact same callback produced:

```text
Receipt: duplicate
Machine state: paid
Transition count: unchanged
```

This is explicitly a local provider-callback simulation. A real public Stripe webhook still requires Stripe CLI or a public tunnel.

### Live Postgres concurrency

Eight simultaneous callers were executed against the active Postgres database.

Capability idempotency:

```text
1 × claimed
7 × in_progress
then replay after completion
then conflict for a changed request body
```

Provider receipts:

```text
1 × claimed
7 × duplicate
then duplicate after completion replay
```

These results came from the real Postgres unique constraints and transactions, not an in-memory fake.

## Final automated verification

- `pnpm typecheck` — PASS
- `pnpm test` — PASS, 147 files / 520 tests
- `pnpm build` — PASS
- Targeted Biome checks for changed reliability files — PASS

Build warnings remain limited to existing browser SDK `import.meta` and client bundle-size warnings.

## Remaining external verification

The only intentionally deferred check is a real public Stripe webhook delivery through Stripe CLI or a tunnel. The application callback path has already been exercised with a correctly signed local Nango-boundary event.
