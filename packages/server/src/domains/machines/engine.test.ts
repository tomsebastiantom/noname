import { describe, expect, it } from "vitest";
import { ConflictError, ValidationError } from "../../shared/domain-error";
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
        revision: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      instances.set(instance.id, instance);
      return instance;
    },
    async findInstance(_orgId, id) {
      return instances.get(id) ?? null;
    },
    async commitTransition(instance, expectedRevision, event, result, params) {
      const current = instances.get(instance.id);
      if ((current?.revision ?? 1) !== expectedRevision) {
        throw new ConflictError("Machine instance revision is stale");
      }
      const saved = { ...instance, revision: expectedRevision + 1 };
      instances.set(instance.id, saved);
      transitions.push({
        id: `transition-${transitions.length + 1}`,
        instanceId: instance.id,
        event,
        fromState: result.fromState,
        toState: result.toState,
        params,
        guardResult: {},
        success: true,
        createdAt: new Date(),
      });
      return saved;
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

  it("allows only one concurrent transition against the same revision", async () => {
    const simpleDefinition: MachineDefinition = {
      name: "machine-cas-test",
      initial: "paid",
      states: { paid: { on: { CANCEL: { target: "cancelled" } } }, cancelled: { final: true } },
    };
    const engine = createMachineEngine(createStorage(simpleDefinition));
    const started = await engine.start("org-1", simpleDefinition.name, {});
    const attempts = await Promise.allSettled([
      engine.transition("org-1", started.id, "CANCEL", { reason: "operator" }, 1),
      engine.transition("org-1", started.id, "CANCEL", { reason: "operator" }, 1),
    ]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    const rejected = attempts.find((attempt) => attempt.status === "rejected");
    expect(rejected?.status === "rejected" ? rejected.reason : null).toBeInstanceOf(ConflictError);
    expect(await engine.getInstance("org-1", started.id)).toMatchObject({
      currentState: "cancelled",
      revision: 2,
    });
  });

  it("replays only a matching successful final transition after a hook failure", async () => {
    const paidCart: MachineDefinition = {
      name: "cart",
      initial: "awaiting_payment",
      states: {
        awaiting_payment: { on: { PAYMENT_SUCCEEDED: { target: "paid" } } },
        paid: { final: true },
      },
    };
    let hookCalls = 0;
    const engine = createMachineEngine(createStorage(paidCart), {
      async onTransitionComplete() {
        hookCalls += 1;
        if (hookCalls === 1) throw new Error("projection unavailable");
      },
    });
    const started = await engine.start("org-1", "cart", { ownerUserId: "user-1" });

    await expect(
      engine.transition("org-1", started.id, "PAYMENT_SUCCEEDED", { paymentRef: "pi_1" }),
    ).rejects.toThrow("projection unavailable");
    expect((await engine.getInstance("org-1", started.id))?.currentState).toBe("paid");

    await expect(
      engine.replayPersistedTransition(
        "org-1",
        started.id,
        "PAYMENT_SUCCEEDED",
        { paymentRef: "other-payment" },
        "paid",
        "awaiting_payment",
      ),
    ).resolves.toBe(false);
    await expect(
      engine.replayPersistedTransition(
        "org-1",
        started.id,
        "PAYMENT_SUCCEEDED",
        { paymentRef: "pi_1" },
        "awaiting_payment",
        "awaiting_payment",
      ),
    ).resolves.toBe(false);
    await expect(
      engine.replayPersistedTransition(
        "org-1",
        started.id,
        "PAYMENT_SUCCEEDED",
        { paymentRef: "pi_1" },
        "paid",
        "awaiting_payment",
      ),
    ).resolves.toBe(true);
    expect(hookCalls).toBe(2);
  });

  it("filters and orders by a generic context date with legacy createdAt fallback", async () => {
    const engine = createMachineEngine(createStorage(definition));
    const laterPaid = await engine.start("org-1", definition.name, {
      paidAt: "2099-01-03T12:00:00.000Z",
      orderRef: "order-later-paid",
    });
    await engine.start("org-1", definition.name, {
      paidAt: "2099-01-01T12:00:00.000Z",
      orderRef: "order-earlier-paid",
    });
    const legacy = await engine.start("org-1", definition.name, {
      orderRef: "order-legacy",
    });

    const page = await engine.searchInstances("org-1", {
      machineName: definition.name,
      contextDateField: "paidAt",
      contextDateAfter: new Date("2099-01-02T00:00:00.000Z"),
      limit: 10,
    });

    expect(page.items.map((instance) => instance.id)).toContain(laterPaid.id);
    expect(page.items.map((instance) => instance.context.orderRef)).not.toContain(
      "order-earlier-paid",
    );
    expect(page.items.map((instance) => instance.id)).not.toContain(legacy.id);
  });

  it("applies generic context-presence filters in the search fallback", async () => {
    const engine = createMachineEngine(createStorage(definition));
    const withOrder = await engine.start("org-1", definition.name, {
      checkoutSnapshot: { totalMinor: 100 },
      checkoutCurrency: "usd",
    });
    await engine.start("org-1", definition.name, { guest: true });

    const page = await engine.searchInstances("org-1", {
      machineName: definition.name,
      contextExists: ["checkoutSnapshot"],
      contextAnyOf: { checkoutCurrency: ["USD", "usd"] },
      limit: 10,
    });

    expect(page.items.map((instance) => instance.id)).toEqual([withOrder.id]);
  });
});
