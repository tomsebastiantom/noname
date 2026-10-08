import {
  createCommerceMachineGuards,
  createCommerceOrderProjector,
  createCommerceProviderEventMappings,
} from "@noname/verticals/commerce";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMachineEngine, registerGuard } from "../machines/engine";
import type {
  MachineDefinition,
  MachineInstanceDTO,
  MachineStorage,
  TransitionRecord,
  TransitionResult,
} from "../machines/ports";
import type { ProviderEventReceiptStore } from "./provider-event-receipts";
import { processProviderEventJob } from "./provider-event-worker";
import type { ProviderEventMapping, ProviderForwardedEvent } from "./provider-events";

const { publish } = vi.hoisted(() => ({ publish: vi.fn(async () => undefined) }));
vi.mock("../../shared/event-bus", () => ({ eventBus: { publish } }));

const providerEvent: ProviderForwardedEvent = {
  orgId: "tenant-a",
  integrationId: "stripe",
  connectionId: "connection-1",
  providerEventId: "evt-1",
  eventType: "checkout.session.completed",
  payload: {},
};

const mapping: ProviderEventMapping = {
  integrationId: "stripe",
  eventType: "checkout.session.completed",
  normalize: () => ({
    event: "PAYMENT_SUCCEEDED",
    machineInstanceId: "cart-1",
    params: { paymentRef: "pi-1" },
  }),
};

function receiptStore(): ProviderEventReceiptStore {
  return {
    claim: vi.fn(async () => "claimed"),
    complete: vi.fn(async () => undefined),
    fail: vi.fn(async () => undefined),
  };
}

function paidCart(overrides: Record<string, unknown> = {}) {
  return {
    id: "cart-1",
    orgId: "tenant-a",
    machineName: "cart",
    currentState: "paid",
    context: { paymentRef: "pi-1" },
    createdAt: new Date(0),
    updatedAt: new Date(),
    ...overrides,
  };
}

function commerceMachineStorage(): MachineStorage {
  const definition: MachineDefinition = {
    name: "cart",
    initial: "awaiting_payment",
    states: {
      awaiting_payment: {
        on: {
          PAYMENT_SUCCEEDED: {
            target: "paid",
            guard: { type: "commerce.payment.matches-checkout" },
          },
        },
      },
      paid: { final: true },
    },
  };
  const instances = new Map<string, MachineInstanceDTO>();
  const transitions: TransitionRecord[] = [];
  let nextId = 0;
  return {
    async findDefinition(_orgId, name) {
      return name === definition.name ? definition : null;
    },
    async saveDefinition(_orgId, saved) {
      return saved;
    },
    async listDefinitions() {
      return [definition];
    },
    async createInstance(orgId, machineName, initialState, context) {
      const instance: MachineInstanceDTO = {
        id: `cart-${++nextId}`,
        orgId,
        machineName,
        currentState: initialState,
        context,
        revision: 1,
        createdAt: new Date("2026-10-01T12:00:00.000Z"),
        updatedAt: new Date("2026-10-01T12:00:00.000Z"),
      };
      instances.set(instance.id, instance);
      return instance;
    },
    async findInstance(_orgId, id) {
      return instances.get(id) ?? null;
    },
    async commitTransition(instance, expectedRevision, event, result, params) {
      const current = instances.get(instance.id);
      if ((current?.revision ?? 1) !== expectedRevision) throw new Error("stale machine revision");
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
    async listInstances(orgId) {
      return [...instances.values()].filter((instance) => instance.orgId === orgId);
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
    async listTransitions(instanceId) {
      return transitions.filter((transition) => transition.instanceId === instanceId);
    },
  };
}

function stripeCheckoutEvent(
  machineInstanceId: string,
  eventType: string,
  payload: Record<string, unknown>,
): ProviderForwardedEvent {
  return {
    orgId: "tenant-a",
    integrationId: "stripe",
    connectionId: "connection-1",
    providerEventId: `evt-${eventType}`,
    eventType,
    payload: {
      client_reference_id: machineInstanceId,
      payment_intent: "pi-commerce-integration",
      payment_status: "paid",
      amount_total: 2500,
      currency: "cad",
      metadata: {},
      ...payload,
    },
  };
}

describe("Commerce payment provider integration", () => {
  beforeEach(() => {
    registerGuard(
      "commerce.payment.matches-checkout",
      createCommerceMachineGuards()["commerce.payment.matches-checkout"],
    );
  });

  it("maps delayed Stripe settlement through the worker, guarded machine, and order projection", async () => {
    let recordNumber = 0;
    const evidence = {
      appendRecord: vi.fn(async (input: { type: string }) => ({
        id: `record-${++recordNumber}-${input.type}`,
        recordedAt: new Date(),
      })),
      appendActivity: vi.fn(async () => ({
        id: "activity-payment-success",
        recordedAt: new Date(),
      })),
      link: vi.fn(async () => ({ id: "evidence-link", createdAt: new Date() })),
    };
    const engine = createMachineEngine(commerceMachineStorage(), {
      onTransitionComplete: createCommerceOrderProjector(evidence),
    });
    const cart = await engine.start("tenant-a", "cart", {
      orderRef: "order:integration-1",
      checkoutAmount: 2500,
      checkoutCurrency: "CAD",
      checkoutSnapshot: {
        schemaVersion: 1,
        currency: "CAD",
        minorUnitExponent: 2,
        totalMinor: 2500,
        lines: [],
        capturedAt: "2026-10-01T12:00:00.000Z",
      },
    });
    const receipts = receiptStore();
    const event = stripeCheckoutEvent(cart.id, "checkout.session.async_payment_succeeded", {});

    await processProviderEventJob(event, {
      machines: engine,
      mappings: createCommerceProviderEventMappings(),
      receipts,
    });

    const paid = await engine.getInstance("tenant-a", cart.id);
    expect(paid).toMatchObject({
      currentState: "paid",
      revision: 2,
      context: {
        paymentRef: "pi-commerce-integration",
        amount: 2500,
        currency: "cad",
        paidAt: expect.any(String),
      },
    });
    expect(evidence.appendRecord).toHaveBeenCalledTimes(2);
    expect(evidence.appendRecord).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: "commerce.order.created",
        subjectId: "order:integration-1",
        data: expect.objectContaining({ amountMinor: 2500, currency: "CAD" }),
      }),
    );
    expect(evidence.appendRecord).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: "commerce.payment.receipt",
        subjectId: "pi-commerce-integration",
        data: expect.objectContaining({ status: "succeeded", amountMinor: 2500 }),
      }),
    );
    expect(evidence.appendActivity).toHaveBeenCalledTimes(1);
    expect(evidence.link).toHaveBeenCalledTimes(2);
    expect(receipts.complete).toHaveBeenCalledWith(event);
    expect(receipts.fail).not.toHaveBeenCalled();
  });

  it("leaves unpaid completed sessions out of the paid machine state", async () => {
    const engine = createMachineEngine(commerceMachineStorage());
    const cart = await engine.start("tenant-a", "cart", {
      checkoutAmount: 2500,
      checkoutCurrency: "CAD",
      checkoutSnapshot: {
        schemaVersion: 1,
        currency: "CAD",
        minorUnitExponent: 2,
        totalMinor: 2500,
        lines: [],
        capturedAt: "2026-10-01T12:00:00.000Z",
      },
    });
    const receipts = receiptStore();
    const event = stripeCheckoutEvent(cart.id, "checkout.session.completed", {
      payment_status: "unpaid",
    });

    await processProviderEventJob(event, {
      machines: engine,
      mappings: createCommerceProviderEventMappings(),
      receipts,
    });

    expect((await engine.getInstance("tenant-a", cart.id))?.currentState).toBe("awaiting_payment");
    expect(receipts.complete).toHaveBeenCalledWith(event);
    expect(receipts.fail).not.toHaveBeenCalled();
  });

  it("keeps mismatched settled callbacks retryable without paying the order", async () => {
    const engine = createMachineEngine(commerceMachineStorage());
    const cart = await engine.start("tenant-a", "cart", {
      checkoutAmount: 2500,
      checkoutCurrency: "CAD",
      checkoutSnapshot: {
        schemaVersion: 1,
        currency: "CAD",
        minorUnitExponent: 2,
        totalMinor: 2500,
        lines: [],
        capturedAt: "2026-10-01T12:00:00.000Z",
      },
    });
    const receipts = receiptStore();
    const event = stripeCheckoutEvent(cart.id, "checkout.session.completed", {
      amount_total: 2499,
    });

    await expect(
      processProviderEventJob(event, {
        machines: engine,
        mappings: createCommerceProviderEventMappings(),
        receipts,
      }),
    ).rejects.toThrow();

    expect((await engine.getInstance("tenant-a", cart.id))?.currentState).toBe("awaiting_payment");
    expect(receipts.complete).not.toHaveBeenCalled();
    expect(receipts.fail).toHaveBeenCalledWith(event, expect.any(String));
  });
});

describe("provider event worker post-persistence recovery", () => {
  beforeEach(() => {
    publish.mockClear();
  });

  it("replays a correlated paid-cart hook and completes the provider receipt", async () => {
    const receipts = receiptStore();
    const machines = {
      transition: vi.fn(async () => {
        throw new Error("PAYMENT_SUCCEEDED rejected in paid state");
      }),
      getInstance: vi.fn(async () => paidCart()),
      replayPersistedTransition: vi.fn(async () => true),
    };

    await processProviderEventJob(providerEvent, { machines, mappings: [mapping], receipts });

    expect(machines.transition).toHaveBeenCalledWith("tenant-a", "cart-1", "PAYMENT_SUCCEEDED", {
      paymentRef: "pi-1",
    });
    expect(machines.replayPersistedTransition).toHaveBeenCalledWith(
      "tenant-a",
      "cart-1",
      "PAYMENT_SUCCEEDED",
      { paymentRef: "pi-1" },
      "paid",
      "awaiting_payment",
    );
    expect(receipts.complete).toHaveBeenCalledWith(providerEvent);
    expect(receipts.fail).not.toHaveBeenCalled();
  });

  it("does not replay an unrelated paid cart and leaves the receipt retryable", async () => {
    const receipts = receiptStore();
    const machines = {
      transition: vi.fn(async () => {
        throw new Error("payment transition rejected");
      }),
      getInstance: vi.fn(async () => paidCart({ context: { paymentRef: "pi-other" } })),
      replayPersistedTransition: vi.fn(async () => true),
    };

    await expect(
      processProviderEventJob(providerEvent, { machines, mappings: [mapping], receipts }),
    ).rejects.toThrow("payment transition rejected");

    expect(machines.replayPersistedTransition).not.toHaveBeenCalled();
    expect(receipts.complete).not.toHaveBeenCalled();
    expect(receipts.fail).toHaveBeenCalledWith(providerEvent, "payment transition rejected");
  });

  it("never replays non-cart or non-paid states", async () => {
    const receipts = receiptStore();
    const machines = {
      transition: vi.fn(async () => {
        throw new Error("rejected");
      }),
      getInstance: vi.fn(async () => paidCart({ currentState: "awaiting_payment" })),
      replayPersistedTransition: vi.fn(async () => true),
    };

    await expect(
      processProviderEventJob(providerEvent, { machines, mappings: [mapping], receipts }),
    ).rejects.toThrow("rejected");
    expect(machines.replayPersistedTransition).not.toHaveBeenCalled();
  });
});
