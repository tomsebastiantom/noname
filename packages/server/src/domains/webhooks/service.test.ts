import { describe, expect, it, vi } from "vitest";

describe("deliverOutbound", () => {
  it("queues one delivery per matching subscription", { timeout: 30_000 }, async () => {
    const { createWebhooksService } = await import("./service");

    const insertOutboundDelivery = vi.fn(async (input) => ({
      ...input,
      attemptCount: 0,
      lastStatusCode: null,
      error: null,
      createdAt: new Date(),
      deliveredAt: null,
    }));
    const outboundAdd = vi.fn(async () => ({ id: "job-1" }));

    const service = createWebhooksService({
      storage: {
        insertReceipt: vi.fn(),
        updateReceipt: vi.fn(),
        findReceipt: vi.fn(),
        listSubscriptions: vi.fn(),
        findSubscription: vi.fn(),
        insertSubscription: vi.fn(),
        updateSubscription: vi.fn(),
        deleteSubscription: vi.fn(),
        listEnabledSubscriptions: vi.fn(async () => [
          {
            id: "sub-1",
            orgId: "org-1",
            url: "https://example.com/hook",
            eventTypes: ["order.paid"],
            enabled: true,
            description: null,
            consecutiveFailures: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
        insertOutboundDelivery,
        updateOutboundDelivery: vi.fn(),
        findOutboundDelivery: vi.fn(),
        findOutboundDeliveryForOrg: vi.fn(),
        listOutboundDeliveries: vi.fn(),
      },
      outboundQueue: { add: outboundAdd } as never,
      secrets: {
        putOrgSecret: vi.fn(),
        hasOrgSecret: vi.fn(async () => true),
      },
    });

    const result = await service.deliverOutbound("org-1", "order.paid", { orderId: "o-1" });
    expect(result.deliveryIds).toHaveLength(1);
    expect(insertOutboundDelivery).toHaveBeenCalledTimes(1);
    expect(outboundAdd).toHaveBeenCalledTimes(1);
  });

  it("does not enqueue a second POST when the delivery was already recorded", {
    timeout: 30_000,
  }, async () => {
    // This is the duplicate case: every process builds the app and subscribes, so each one handles
    // the same event. The unique index lets only one insert through; the others must not enqueue.
    const { createWebhooksService } = await import("./service");

    const insertOutboundDelivery = vi.fn(async () => null);
    const outboundAdd = vi.fn(async () => ({ id: "job-1" }));

    const service = createWebhooksService({
      storage: {
        insertReceipt: vi.fn(),
        updateReceipt: vi.fn(),
        findReceipt: vi.fn(),
        listSubscriptions: vi.fn(),
        findSubscription: vi.fn(),
        insertSubscription: vi.fn(),
        updateSubscription: vi.fn(),
        deleteSubscription: vi.fn(),
        listEnabledSubscriptions: vi.fn(async () => [
          {
            id: "sub-1",
            orgId: "org-1",
            url: "https://example.com/hook",
            eventTypes: ["machine.transition"],
            enabled: true,
            description: null,
            consecutiveFailures: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
        insertOutboundDelivery,
        updateOutboundDelivery: vi.fn(),
        findOutboundDelivery: vi.fn(),
        findOutboundDeliveryForOrg: vi.fn(),
        listOutboundDeliveries: vi.fn(),
      },
      outboundQueue: { add: outboundAdd } as never,
      secrets: {
        putOrgSecret: vi.fn(),
        hasOrgSecret: vi.fn(async () => true),
      },
    });

    const result = await service.deliverOutbound(
      "org-1",
      "machine.transition",
      {},
      "org-1:inst-1:7",
    );
    expect(result.deliveryIds).toHaveLength(0);
    expect(outboundAdd).not.toHaveBeenCalled();
  });
});

describe("registerWebhookOutboundRouter", () => {
  async function handlersFor() {
    const { registerWebhookOutboundRouter } = await import("./outbound-router");
    const deliverOutbound = vi.fn(async () => ({ deliveryIds: ["d1"] }));
    const handlers = new Map<string, Array<(payload: unknown) => Promise<void>>>();

    registerWebhookOutboundRouter({
      webhooks: { deliverOutbound },
      subscribe: (event, handler) => {
        const list = handlers.get(event) ?? [];
        list.push(handler);
        handlers.set(event, list);
      },
    });

    return { deliverOutbound, machineHandlers: handlers.get("machine.transition") ?? [] };
  }

  it("delivers machine.transition events keyed by the transition revision", async () => {
    const { deliverOutbound, machineHandlers } = await handlersFor();
    expect(machineHandlers).toHaveLength(1);

    await machineHandlers[0]!({
      orgId: "org-1",
      instanceId: "inst-1",
      event: "PAY",
      fromState: "cart",
      toState: "paid",
      revision: 3,
    });

    expect(deliverOutbound).toHaveBeenCalledWith(
      "org-1",
      "machine.transition",
      {
        instanceId: "inst-1",
        event: "PAY",
        fromState: "cart",
        toState: "paid",
      },
      // Occurrence-unique: two separate occurrences of the same transition must not share a key,
      // otherwise the unique index would suppress a legitimate repeat delivery.
      "org-1:inst-1:3",
    );
  });

  it("gives the same event the same key when it reaches two processes", async () => {
    // This is what makes the unique index collapse N processes into one delivery.
    const first = await handlersFor();
    const second = await handlersFor();
    const payload = {
      orgId: "org-1",
      instanceId: "inst-1",
      event: "addToCart",
      fromState: "active",
      toState: "active",
      revision: 7,
    };

    await first.machineHandlers[0]!(payload);
    await second.machineHandlers[0]!(payload);

    const firstKey = first.deliverOutbound.mock.calls[0]?.[3];
    const secondKey = second.deliverOutbound.mock.calls[0]?.[3];
    expect(firstKey).toBe("org-1:inst-1:7");
    expect(secondKey).toBe(firstKey);
  });

  it("gives two occurrences of the same transition different keys", async () => {
    const { deliverOutbound, machineHandlers } = await handlersFor();
    const base = {
      orgId: "org-1",
      instanceId: "inst-1",
      event: "addToCart",
      fromState: "active",
      toState: "active",
    };

    await machineHandlers[0]!({ ...base, revision: 4 });
    await machineHandlers[0]!({ ...base, revision: 5 });

    const keys = deliverOutbound.mock.calls.map((call) => call[3]);
    expect(keys).toEqual(["org-1:inst-1:4", "org-1:inst-1:5"]);
    expect(new Set(keys).size).toBe(2);
  });

  it("fails open with a random id when revision is missing", async () => {
    // Reusing a colliding key here would let the unique index drop a real delivery; a duplicate is
    // the lesser failure, so an unknown occurrence is never treated as a repeat.
    const { deliverOutbound, machineHandlers } = await handlersFor();

    await machineHandlers[0]!({
      orgId: "org-1",
      instanceId: "inst-1",
      event: "PAY",
      fromState: "cart",
      toState: "paid",
    });

    const key = deliverOutbound.mock.calls[0]?.[3] as string;
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});

describe("retryOutboundDelivery", () => {
  it("requeues failed delivery", { timeout: 30_000 }, async () => {
    const { createWebhooksService } = await import("./service");

    const findOutboundDeliveryForOrg = vi.fn(async () => ({
      id: "del-1",
      orgId: "org-1",
      subscriptionId: "sub-1",
      eventType: "order.paid",
      eventId: "evt-1",
      payload: { orderId: "o-1" },
      status: "failed",
      attemptCount: 5,
      lastStatusCode: 500,
      error: "HTTP 500",
      createdAt: new Date(),
      deliveredAt: null,
    }));
    const findSubscription = vi.fn(async () => ({
      id: "sub-1",
      orgId: "org-1",
      url: "https://example.com/hook",
      eventTypes: ["order.paid"],
      enabled: true,
      description: null,
      consecutiveFailures: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    const updateOutboundDelivery = vi.fn(async () => {});
    const outboundAdd = vi.fn(async () => ({ id: "job-retry" }));

    const service = createWebhooksService({
      storage: {
        insertReceipt: vi.fn(),
        updateReceipt: vi.fn(),
        findReceipt: vi.fn(),
        listSubscriptions: vi.fn(),
        findSubscription,
        insertSubscription: vi.fn(),
        updateSubscription: vi.fn(),
        deleteSubscription: vi.fn(),
        listEnabledSubscriptions: vi.fn(),
        insertOutboundDelivery: vi.fn(),
        updateOutboundDelivery,
        findOutboundDelivery: vi.fn(),
        findOutboundDeliveryForOrg,
        listOutboundDeliveries: vi.fn(),
      },
      outboundQueue: { add: outboundAdd } as never,
      secrets: {
        putOrgSecret: vi.fn(),
        hasOrgSecret: vi.fn(async () => true),
      },
    });

    const result = await service.retryOutboundDelivery("org-1", "del-1");
    expect(result).toEqual({ deliveryId: "del-1", jobId: "job-retry" });
    expect(updateOutboundDelivery).toHaveBeenCalledWith(
      "del-1",
      expect.objectContaining({ status: "queued", attemptCount: 0 }),
    );
    expect(outboundAdd).toHaveBeenCalledTimes(1);
  });
});
