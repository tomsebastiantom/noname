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
});

describe("registerWebhookOutboundRouter", () => {
  it("delivers machine.transition events", async () => {
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

    const machineHandlers = handlers.get("machine.transition") ?? [];
    expect(machineHandlers).toHaveLength(1);

    await machineHandlers[0]!({
      orgId: "org-1",
      instanceId: "inst-1",
      event: "PAY",
      fromState: "cart",
      toState: "paid",
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
      "org-1:inst-1:PAY:paid",
    );
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
