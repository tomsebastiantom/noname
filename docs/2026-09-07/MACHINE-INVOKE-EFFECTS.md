# Machine Invoke Effects (Declared Services)

> **Date:** 2026-09-07
> **Status:** Active design — implement after dispatcher proves the contract
> **Read first:** [`VERTICAL-SERVER-EFFECTS.md`](./VERTICAL-SERVER-EFFECTS.md) · [`EXTENSION-BACKENDS.md`](./EXTENSION-BACKENDS.md)

---

## Rule in one line

Machines **declare** service calls (`invoke`); the host **executes** them via registered implementations. The engine never does I/O.

---

## The shape (XState-faithful)

```json
{ "on": { "checkout": {
  "target": "active",
  "invoke": { "service": "extensionBackend", "timeoutMs": 30000, "retries": 3 }
} } }
```

* Definition carries names + policy only — no URLs, secrets, or vertical logic.
* Engine emits an effect request on transition; result (or timeout) feeds back as a machine event (`checkout_failed` on exhaustion — declared, visible, auditable).
* Implementations register by name like `registerGuard` does today: one generic `extensionBackend` function for all verticals (resolve URL, sign, POST, map result).

## Borrowed from Temporal / Restate (and what we skip)

* **Borrow: per-invoke policy.** Temporal activities declare `RetryPolicy` + timeouts; Restate invocations carry timeouts. Our `invoke` carries `timeoutMs`/`retries`/`backoff` in JSON — policy travels with the declaration, not hardcoded in the host.
* **Borrow: idempotency per attempt.** Temporal dedupes by workflow+activity id; each invoke carries an `invocationId`, retried attempts reuse it, backends dedupe on it (same key family as `orderRef`).
* **Borrow: compensation as transitions.** Temporal sagas compensate explicitly; ours is a `checkout_failed`-style state plus compensating transitions — no separate saga language.
* **Skip: determinism constraints.** Temporal bans `Date.now`/random/IO in workflow code because it replays history. Our engine doesn't replay — imposing those rules buys nothing.
* **Skip: a separate durable runtime.** Postgres (`machine_transitions` is already an event log) + BullMQ cover durability; no new infrastructure.

## What this replaces / keeps

* Replaces dispatcher-queue invocation for request/response flows (invoke returns results into state; queues can't).
* Keeps the dispatcher for pure fan-out with no reply needed.
* Engine purity untouched: no document ports, no HTTP, no secrets in core — same rule as guards.
