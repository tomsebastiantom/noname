# Decision — XState Execution and Durable Event Queues

> **Date:** 2026-09-09
> **Status:** Binding architecture decision
> **Scope:** XState machine transitions, Nango callbacks, event bus, and BullMQ

## Decision

Use **XState as the only transition authority**, use **BullMQ for durable work and retries**, and retain the **event bus only for asynchronous fan-out notifications**.

The queue is not a replacement for XState and it is not a generic queue for every platform event. The current `{provider-events}` queue is specifically for Nango-forwarded provider callbacks that may arrive asynchronously, require retry, need idempotency, and must not block the HTTP request.

## Why both event bus and queue exist

| Mechanism | Purpose | Durable? | Retry? | Typical use |
|---|---|---:|---:|---|
| HTTP request | Authenticate and accept the callback | Only after enqueue | No | Nango ingress |
| BullMQ | Durable command/work processing | Yes | Yes | Nango provider event processing, extension delivery |
| Event bus | Notify independent subscribers after processing | No event-log guarantee | No | Analytics, observability, outbound fan-out |
| XState actor | Decide one machine transition | State is persisted by engine | Engine/job retry boundary | `PAYMENT_SUCCEEDED` → `paid` |

The event bus must never be the only delivery mechanism for a business-critical provider callback. A Redis outage or subscriber failure must not lose the callback after the provider has received a success response.

## Correct Nango flow

```text
Nango callback
  → integrations ingress verifies signature and resolves connection
  → enqueue provider event with deterministic job ID
  → HTTP 2xx only after durable enqueue succeeds
  → provider-event worker claims BullMQ job
  → provider mapping normalizes provider payload
  → machine engine receives one normalized event
  → ephemeral XState actor executes one transition
  → engine persists currentState/context and transition audit
  → event bus publishes resulting machine.transition
  → analytics and outbound subscribers consume fan-out
```

The queue carries the **external event command**. XState carries the **state-machine decision**. The event bus carries **notifications about the result**.

## What the XState migration must implement

The migration described in [`XSTATE-REUSE-MIGRATION-PLAN.md`](./XSTATE-REUSE-MIGRATION-PLAN.md) remains the machine-engine contract and is not replaced by the provider-event worker. The current implementation now routes provider jobs to the machine engine from a worker; the engine is being migrated to execute those transitions through ephemeral XState actors.

### Definition normalization

Add a pure adapter beside `engine.ts` that:

- Converts stored JSON into an XState-faithful configuration.
- Maps `name` to `id`, `initial` to `initial`, states to state nodes, and transition targets directly.
- Injects synchronous registered guards into XState `guards` implementations.
- Preserves supported `entry`, `exit`, and final-state declarations.
- Rejects missing initial states, invalid targets, malformed transitions, unsupported arrays, and ambiguous legacy shapes before persistence.

`define()` must validate this normalized configuration before saving. `load()` must validate/normalize before execution.

### Start

`start()` must:

1. Load and normalize the definition.
2. Build one ephemeral actor with the supplied context and implementations.
3. Start the actor.
4. Read state and context only from the actor snapshot.
5. Persist the snapshot projection using existing `currentState` and `context` fields.
6. Stop the actor in `finally`.

### Transition

`transition()` must:

1. Load the instance and definition.
2. Build the normalized machine.
3. Restore from `currentState` plus `context` for the current flat-state scope.
4. Send exactly one event containing the request parameters.
5. Read the resulting state and context only from XState.
6. Persist and audit the result.
7. Publish the existing transition event and run the completion hook.
8. Stop the actor in `finally`.

The engine must not inspect `state.on[event]` to choose a target, run a separate `evaluateTransition()`, merge context independently, or invoke the same guard twice.

## Queue boundary for machine transitions

The provider-event worker may call `MachineEngine.transition()` because it is an asynchronous event consumer. The worker must not build an XState machine or calculate a target itself.

The call is:

```ts
await machines.transition(orgId, machineInstanceId, normalizedEvent, params);
```

The machine engine then owns actor creation, event sending, guard evaluation, snapshot reading, persistence, audit, and cleanup. If the transition fails with a domain validation error, the worker should mark the job as handled/rejected according to the provider-event policy rather than retrying a permanent business rejection forever.

Infrastructure failures should throw so BullMQ retries. Deterministic provider event IDs and job IDs prevent duplicate callback deliveries from creating duplicate work.

## Event bus boundary

The event bus may publish:

- `provider.event.received` after the durable job has been accepted, for observability or raw-event subscribers.
- `provider.event.normalized` after mapping succeeds, for subscribers that need the normalized event.
- `machine.transition` after XState successfully persists a transition.

No critical state transition may depend solely on an event-bus subscriber. The provider-event worker is the durable consumer responsible for invoking the machine engine.

## Queue reuse decision

Do not create one queue per provider or one queue per machine. Use shared queues by operational behavior:

- `{provider-events}` — all Nango-forwarded provider callbacks; partition or route by job data if throughput requires it.
- `{extension-delivery}` — signed HTTP delivery to extension backends.
- Existing email, agent, analytics, and catalog queues — their own retry/latency policies.

A new queue is justified only when a workload needs a materially different retry policy, timeout, concurrency, ordering, or isolation boundary. Provider count alone is not a reason to add queues.

For high-volume tenants or providers, use BullMQ job prioritization, worker concurrency, rate limiting, and deterministic partition keys. Do not move transition authority into queue code.

## Idempotency and concurrency

- Job IDs use the Nango connection plus provider event/delivery ID.
- The machine engine must retain its storage concurrency boundary for competing events on one instance.
- Queue deduplication prevents duplicate delivery attempts; it does not order different events.
- Machine transition audit records remain the source of truth for accepted/rejected machine events.
- A future snapshot column is not needed for the current flat-state machine subset.

## Final answer to the design question

The queue is for this Nango callback situation and for other asynchronous workloads with the same durability/retry requirements. It is not a generic replacement for the event bus, and it is not part of XState itself.

The correct final architecture is:

```text
Nango → durable provider-event queue → worker → MachineEngine → ephemeral XState actor
                                                        ↓
                                             persisted state/context
                                                        ↓
                                                   event bus fan-out
```

This preserves scalability, keeps the machine engine pure, and satisfies the planned XState migration without introducing a second transition engine.
