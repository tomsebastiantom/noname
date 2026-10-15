import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * `cart.json` is the source of truth for the order lifecycle, but this seeder is its *only*
 * consumer: it POSTs the file to `/api/machines/definitions`, which writes the
 * `machine_definitions` row the engine actually loads. Nothing read this file at test time, so
 * nothing asserted that it still described what the commerce capabilities drive.
 *
 * That asymmetry has already caused a real outage. The stored row carried four states
 * (`active`, `awaiting_payment`, `paid`, `payment_failed`) while this file declared nine, so
 * `commerce.orders.cancel`, `.fulfill` and `.refund` could not succeed through the real path at
 * all — the engine rejected their events as unhandled. Nothing reported it, because a definition
 * missing a transition does not error when seeded; it only rejects the event much later, when an
 * operator action fails in the browser. Earlier "verification" of those capabilities had passed
 * only because it wrote to the tables with direct SQL, bypassing the machine layer entirely.
 *
 * These assertions pin the contract the capability layer depends on, deliberately as *required
 * members* rather than a snapshot: adding states or events is fine, removing or renaming one that
 * commerce code drives is not.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");

type Transition = { target: string; guard?: { type: string } };
type StateNode = { on?: Record<string, Transition>; final?: boolean };
type CartDefinition = { name: string; initial: string; states: Record<string, StateNode> };

const definition = JSON.parse(
  readFileSync(join(ROOT, "packages/extensions/src/commerce/machines/cart.json"), "utf8"),
) as CartDefinition;

/** States the commerce capabilities address by name (order search, cancel, fulfill, refund). */
const REQUIRED_STATES = [
  "active",
  "checkout_pending",
  "awaiting_payment",
  "paid",
  "refund_pending",
  "cancelled",
  "fulfilled",
  "refunded",
  "payment_failed",
] as const;

/**
 * `[from, event, target]` for every transition commerce code emits or depends on.
 * Sources: `capabilities.ts` (CANCEL_ORDER / MARK_FULFILLED / REFUND_ORDER at the `paid` state,
 * the `paid`-only refund precondition, and the REFUND_CONFIRMED / REFUND_FAILED provider
 * mappings) and `order-projection.ts` (which reacts to the cancel and fulfil transitions).
 */
const REQUIRED_TRANSITIONS: ReadonlyArray<readonly [from: string, event: string, target: string]> =
  [
    ["paid", "CANCEL_ORDER", "cancelled"],
    ["paid", "MARK_FULFILLED", "fulfilled"],
    ["paid", "REFUND_ORDER", "refund_pending"],
    ["refund_pending", "REFUND_CONFIRMED", "refunded"],
    ["refund_pending", "REFUND_FAILED", "paid"],
    ["awaiting_payment", "PAYMENT_SUCCEEDED", "paid"],
    ["awaiting_payment", "PAYMENT_FAILED", "payment_failed"],
  ];

/** Terminal states commerce treats as end-of-lifecycle. A refundable order must not be one. */
const REQUIRED_FINAL_STATES = ["cancelled", "fulfilled", "refunded", "payment_failed"] as const;

function statesReachableFrom(initial: string): Set<string> {
  const seen = new Set([initial]);
  const queue = [initial];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const transition of Object.values(definition.states[current]?.on ?? {})) {
      if (!seen.has(transition.target)) {
        seen.add(transition.target);
        queue.push(transition.target);
      }
    }
  }
  return seen;
}

describe("cart machine definition contract", () => {
  it("declares the name and initial state the seeder and engine assume", () => {
    expect(definition.name).toBe("cart");
    expect(definition.initial).toBe("active");
  });

  it("contains every state the commerce capabilities address by name", () => {
    const missing = REQUIRED_STATES.filter((state) => !(state in definition.states));
    // Named explicitly rather than compared to the full key set, so adding a state is not a failure.
    expect(missing).toEqual([]);
  });

  it("wires every order-lifecycle transition the capabilities emit", () => {
    const problems = REQUIRED_TRANSITIONS.flatMap(([from, event, target]) => {
      const transition = definition.states[from]?.on?.[event];
      if (!transition) return [`${from} --${event}--> is not declared`];
      if (transition.target !== target) {
        return [`${from} --${event}--> points at "${transition.target}", expected "${target}"`];
      }
      return [];
    });
    expect(problems).toEqual([]);
  });

  it("keeps the order terminal states final", () => {
    const notFinal = REQUIRED_FINAL_STATES.filter(
      (state) => definition.states[state]?.final !== true,
    );
    expect(notFinal).toEqual([]);
  });

  it("keeps PAYMENT_SUCCEEDED guarded, so an unrelated payment cannot mark a cart paid", () => {
    const transition = definition.states.awaiting_payment?.on?.PAYMENT_SUCCEEDED;
    expect(transition).toBeDefined();
    expect(transition?.guard?.type).toBeTruthy();
  });

  it("reaches every declared state from the initial state", () => {
    // The inverse drift: a state that exists but can never be entered is dead configuration,
    // and any capability waiting for it would wait forever.
    const reachable = statesReachableFrom(definition.initial);
    const orphans = Object.keys(definition.states).filter((state) => !reachable.has(state));
    expect(orphans).toEqual([]);
  });
});
