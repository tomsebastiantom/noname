import { describe, expect, it } from "vitest";
import { normalizeMachineDefinition } from "./machine-config";
import type { MachineDefinition } from "./ports";

const definition: MachineDefinition = {
  name: "cart",
  initial: "active",
  states: {
    active: {
      on: {
        checkout: {
          target: "awaiting_payment",
          guard: { type: "hasItems", params: { minimum: 1 } },
        },
      },
    },
    awaiting_payment: {
      on: { PAYMENT_SUCCEEDED: { target: "paid" } },
    },
    paid: { final: true },
  },
};

describe("normalizeMachineDefinition", () => {
  it("returns an XState-shaped definition without changing the persisted contract", () => {
    const normalized = normalizeMachineDefinition(definition);

    expect(normalized).toEqual({
      id: "cart",
      initial: "active",
      states: {
        active: {
          on: {
            checkout: {
              target: "awaiting_payment",
              guard: { type: "hasItems", params: { minimum: 1 } },
            },
          },
          entry: [],
          exit: [],
          final: false,
        },
        awaiting_payment: {
          on: { PAYMENT_SUCCEEDED: { target: "paid" } },
          entry: [],
          exit: [],
          final: false,
        },
        paid: { on: {}, entry: [], exit: [], final: true },
      },
    });
    expect(definition.states.active.on?.checkout?.target).toBe("awaiting_payment");
  });

  it("rejects missing initial states and invalid targets", () => {
    expect(() => normalizeMachineDefinition({ ...definition, initial: "missing" })).toThrow(
      "Initial state missing not found in states",
    );
    expect(() =>
      normalizeMachineDefinition({
        ...definition,
        states: { ...definition.states, active: { on: { checkout: { target: "missing" } } } },
      }),
    ).toThrow("does not exist");
  });

  it("rejects malformed action and guard metadata", () => {
    expect(() =>
      normalizeMachineDefinition({
        ...definition,
        states: { ...definition.states, active: { entry: ["ok", 3 as never] } },
      }),
    ).toThrow("entry actions");
    expect(() =>
      normalizeMachineDefinition({
        ...definition,
        states: {
          ...definition.states,
          active: { on: { checkout: { target: "awaiting_payment", guard: { type: "" } } } },
        },
      }),
    ).toThrow("Malformed guard");
  });
});
