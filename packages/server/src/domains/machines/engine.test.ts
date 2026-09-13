import { describe, expect, it } from "vitest";
import { ValidationError } from "../../shared/domain-error";
import { createMachineEngine, registerGuard } from "./engine";
import type {
  MachineDefinition,
  MachineInstanceDTO,
  MachineStorage,
  TransitionRecord,
  TransitionResult,
} from "./ports";

function createStorage(definition: MachineDefinition): MachineStorage {
  const instances = new Map<string, MachineInstanceDTO>();
  const transitions: TransitionRecord[] = [];
  let nextId = 0;
  return {
    async findDefinition(_orgId, name) {
      return name === definition.name ? definition : null;
    },
    async saveDefinition() {
      return definition;
    },
    async listDefinitions() {
      return [definition];
    },
    async createInstance(orgId, machineName, initialState, context) {
      const instance: MachineInstanceDTO = {
        id: `instance-${++nextId}`,
        orgId,
        machineName,
        currentState: initialState,
        context,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      instances.set(instance.id, instance);
      return instance;
    },
    async findInstance(_orgId, id) {
      return instances.get(id) ?? null;
    },
    async updateInstance(instance) {
      instances.set(instance.id, instance);
      return instance;
    },
    async listInstances() {
      return [...instances.values()];
    },
    async logTransition(instanceId, event, result: TransitionResult, params) {
      transitions.push({
        id: `transition-${transitions.length + 1}`,
        instanceId,
        event,
        fromState: result.fromState,
        toState: result.toState,
        params,
        guardResult: {},
        success: result.success,
        error: result.error,
        createdAt: new Date(),
      });
    },
    async listTransitions() {
      return transitions;
    },
  };
}

const definition: MachineDefinition = {
  name: "machine-engine-test",
  initial: "active",
  states: {
    active: {
      on: {
        advance: { target: "ready", guard: { type: "machine-engine-test-guard" } },
      },
    },
    ready: {
      on: { finish: { target: "done" } },
    },
    done: { final: true },
  },
};

describe("machine engine XState execution", () => {
  it("starts, transitions once, reloads from persisted state, and invokes guards once", async () => {
    let guardCalls = 0;
    registerGuard("machine-engine-test-guard", () => {
      guardCalls += 1;
      return { passed: true, name: "machine-engine-test-guard" };
    });

    const engine = createMachineEngine(createStorage(definition));
    const started = await engine.start("org-1", definition.name, { cartId: "cart-1" });
    expect(started.currentState).toBe("active");

    const ready = await engine.transition("org-1", started.id, "advance", {
      checkoutId: "checkout-1",
    });
    expect(ready.currentState).toBe("ready");
    expect(ready.context).toEqual({ cartId: "cart-1", checkoutId: "checkout-1" });
    expect(guardCalls).toBe(1);

    const reloaded = await engine.getInstance("org-1", started.id);
    expect(reloaded?.currentState).toBe("ready");
    const done = await engine.transition("org-1", started.id, "finish");
    expect(done.currentState).toBe("done");
    expect(done.context).toEqual(ready.context);
  });

  it("rejects an unhandled event without changing the instance", async () => {
    const engine = createMachineEngine(createStorage(definition));
    const started = await engine.start("org-1", definition.name, {});

    await expect(engine.transition("org-1", started.id, "finish")).rejects.toBeInstanceOf(
      ValidationError,
    );
    const unchanged = await engine.getInstance("org-1", started.id);
    expect(unchanged?.currentState).toBe("active");
  });
});
