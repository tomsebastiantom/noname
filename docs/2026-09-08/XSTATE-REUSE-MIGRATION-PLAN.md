# XState Reuse Migration Plan

> **Date:** 2026-09-08  
> **Status:** Phase C implementation in progress — actor execution landed; normalization and full regression coverage remain

> **Scope:** Replace the machine engine's private transition DSL execution with real XState configuration and ephemeral actors, without changing the public API or storage contract.

## 1. Why this work exists

The platform decision is already binding: machine definitions are JSON data stored per organization, XState is the workflow engine, and the server engine is only the adapter between storage, ports, API, guards, and events.

The current implementation is only partially aligned:

- `engine.ts` builds an XState machine during `start()` only to read the initial state.
- `transition()` reads `state.on[event]` and computes the target itself.
- Guards are evaluated outside XState by a separate engine registry.
- Context changes are applied by a separate `{ ...context, ...params }` merge.
- The stored instance keeps only `currentState` and `context`; it does not persist an XState snapshot.

This creates two transition models. The migration must remove that duplication rather than add a second validation pass.

## 2. Binding constraints

1. **XState is the sole transition authority.** Do not calculate the target state in parallel in engine code.
2. **Definitions remain JSONB.** Do not add a code-first machine DSL or vertical-specific machine types.
3. **Actors are ephemeral per request.** No long-lived actor registry in the API process.
4. **Guards remain injected implementations.** JSON stores guard names and parameters; TypeScript supplies the implementation.
5. **Engine remains pure infrastructure.** No HTTP, provider calls, secrets, or commerce logic in the machines domain.
6. **Keep `MachineEngine`, `MachineStorage`, and API routes stable** unless a snapshot field is proven necessary.
7. **No invoke/effect implementation in this migration.** Follow `MACHINE-INVOKE-EFFECTS.md` separately after the dispatcher contract is proven.
8. **Do not silently support incompatible legacy semantics.** Normalize known input at load/define time and reject ambiguous definitions.

## 3. Target runtime model

### Definition load

`load` and `define` normalize the stored JSON into an XState-faithful configuration:

- `name` maps to the XState machine `id`.
- `initial` maps to `initial`.
- Each state maps to an XState state node.
- `on[event].target` maps directly to an XState transition.
- `on[event].guard` maps to a named guard implementation through `implementations.guards`.
- `entry`, `exit`, and `final` are preserved where supported.
- Invalid targets, missing initial states, malformed transitions, and unsupported shapes fail validation before persistence.

Normalization should be a pure function with unit tests. It should return the XState config plus the metadata needed by the existing ports, not mutate the database representation unexpectedly.

### Start

1. Load and normalize the definition.
2. Create an actor with the supplied context and injected implementations.
3. Start the actor.
4. Read the initial state from the actor snapshot.
5. Persist the instance using the snapshot state and context.
6. Stop the actor in a `finally` block.

The actor is used for execution, not merely for checking that the initial state exists.

### Transition

1. Load the instance and definition.
2. Build the normalized XState machine with the instance context.
3. Restore the actor to the persisted state/snapshot.
4. Send exactly one event to the actor, with event data derived from the request params.
5. If XState does not handle the event or a guard rejects it, record the rejected transition and return the existing `ValidationError` behavior.
6. Read the next state and context exclusively from the actor snapshot.
7. Persist the resulting state/context and audit record.
8. Publish the existing transition event and run the existing completion hook.
9. Stop the actor in a `finally` block.

There must be no later `evaluateTransition()` target calculation and no second guard invocation for the same event.

## 4. Guard contract

The current guard type permits asynchronous implementations:

```ts
type Guard = (ctx: GuardContext) => Promise<GuardResult> | GuardResult;
```

XState transition guards are synchronous predicates. Therefore the migration must choose one explicit boundary instead of pretending async guards are synchronous:

- **Phase 1 recommendation:** keep request-time guards as an engine precondition only if they are genuinely async, but convert the result into a deterministic XState event (`guard_passed` / `guard_rejected`) rather than sending the business event twice; or
- **Preferred long-term contract:** split guards into synchronous XState guards and async effect/precondition handlers, with async work represented by the invoke/effect contract in `MACHINE-INVOKE-EFFECTS.md`.

Before implementation, inventory all registered guards. If every current guard is synchronous in practice, narrow the registry to synchronous guards and inject them directly into XState. If any guard performs I/O, do not place it in an XState guard callback.

Guard results and rejection reasons must remain available to `machine_transitions` and existing rejection events. The adapter may retain an execution-result object around the actor call, but it must not independently choose the target state.

## 5. Snapshot persistence decision

The current schema persists `currentState` and `context`, which is sufficient for the current flat-state machine subset. XState snapshots become necessary when the platform enables compound states, parallel states, history, delayed transitions, or actor children.

Implement in two steps:

1. **Initial migration:** restore the actor from `currentState` plus `context`; persist the resulting state and context through the existing storage port. Prove behavior for the current flat-state cart machines.
2. **Snapshot extension:** add an optional JSONB `snapshot` field to `machine_instances` and the storage DTO only when a real machine requires XState metadata that cannot be reconstructed from state/context. Version the snapshot payload and retain `currentState` as a query/debug projection.

Do not add a snapshot column speculatively. The plan requires proving the current model first, then extending storage only for demonstrated XState state.

## 6. Files and responsibilities

- `packages/server/src/domains/machines/engine.ts`
  - Replace manual transition selection/evaluation with actor execution.
  - Keep storage, event bus, hooks, and public engine ports.
  - Remove duplicate target computation and any duplicate guard execution.
- `packages/server/src/domains/machines/ports.ts`
  - Update types only where the XState config or snapshot boundary requires it.
  - Preserve API-facing DTO compatibility.
- `packages/server/src/domains/machines/schema.ts`
  - No change in the initial phase.
  - Add a versioned optional snapshot only after the flat-state proof.
- `packages/server/src/domains/machines/adapters/postgres.ts`
  - Map any approved snapshot field and preserve existing audit behavior.
- New machine config/adapter module beside `engine.ts`
  - Pure normalization from stored JSON to XState config.
  - No storage or network access.
- Machine tests beside the machines domain
  - In-memory storage fixture.
  - Start, transition, guard pass, guard reject, unknown event, invalid target, context update, and actor cleanup cases.
- `packages/extensions/src/commerce/` machine definition and cart flow
  - Regression fixture only; no extension-specific engine behavior.

## 7. Test-first acceptance criteria

The migration is complete only when all of these pass:

1. Existing machine definitions load without changing their public JSON shape.
2. `start()` persists the state reported by XState.
3. A successful event changes state exactly once and persists the actor context.
4. A rejected guard produces the existing validation error, rejection event, and failed audit record.
5. An unknown event does not update the instance.
6. Invalid definitions are rejected before storage.
7. A transition invokes the guard implementation at most once.
8. No actor remains running after success or failure.
9. Existing cart flow remains green: guest add, login, claim, and owner stamping still work.
10. API responses and `MachineEngine` ports remain compatible.
11. Server typecheck, lint, and the complete machine/domain test suite pass.
12. A live smoke test proves start → transition → reload instance → transition again, demonstrating that ephemeral actors reconstruct correctly from persisted state/context.

## 8. Implementation order

### Phase A — establish the current contract

- Add an in-memory machine engine test fixture.
- Capture current cart machine definitions and expected transition results.
- Inventory registered guards and classify them synchronous vs asynchronous.
- Add tests that explicitly detect duplicate guard calls and duplicate state updates.

### Phase B — normalize definitions

- Add the pure XState normalization function.
- Make `define()` validate the normalized result before saving.
- Preserve final states and supported entry/exit declarations.
- Reject unsupported or ambiguous transition forms rather than guessing.

### Phase C — execute with ephemeral actors

- Refactor `start()` to persist actor output.
- Refactor `transition()` to send one event to one actor and persist its snapshot output.
- Introduce `try/finally` actor stopping.
- Move audit/event/hook behavior around the single XState result.

### Phase D — resolve async guards honestly

- If all guards are synchronous, narrow and inject them into XState.
- If guards are asynchronous, keep them outside XState only as a clearly named precondition phase and document the boundary; do not call the business transition twice.
- Reserve request/response external work for the declared invoke/effect contract.

### Phase E — prove and integrate

- Run machine tests, cart tests, full typecheck, and lint.
- Run the live cart smoke test and the persisted-instance reload test.
- Only then consider optional snapshot persistence for compound XState features.

## 9. Explicit non-goals

- No checkout implementation.
- No orders/admin UI work.
- No Nango calls from the machine engine.
- No commerce-specific tables or branches in the generic engine.
- No long-running actor process.
- No Temporal, Restate, or new workflow runtime.
- No second transition evaluator added as a safety check.

## 10. Related decisions

- [`SESSION-STATUS.md`](./SESSION-STATUS.md) — current handoff and ordered work.
- [`MACHINE-INVOKE-EFFECTS.md`](../2026-09-07/MACHINE-INVOKE-EFFECTS.md) — declared services and effect boundary.
- [`VERTICAL-SERVER-EFFECTS.md`](../2026-09-07/VERTICAL-SERVER-EFFECTS.md) — slim vertical effects now, extension backends later.
- [`EXTENSION-BACKENDS.md`](../2026-09-07/EXTENSION-BACKENDS.md) — future isolated backend boundary.
- [`PUBLIC-ACCESS-MODEL.md`](../2026-09-07/PUBLIC-ACCESS-MODEL.md) — gateway and publishable-key constraints for public machine routes.
