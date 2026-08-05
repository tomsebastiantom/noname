import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createGenericHmacAdapter } from "./adapters/generic-hmac";
import { createStripeWebhookAdapter } from "./adapters/stripe";

describe("generic-hmac adapter", () => {
  const secret = "test-generic-secret";
  const adapter = createGenericHmacAdapter(secret);

  it("verifies valid signature", () => {
    const body = JSON.stringify({
      eventId: "evt-1",
      eventType: "order.created",
      orgId: "org-1",
    });
    const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    expect(adapter.verify(body, { "x-webhook-signature": signature })).toBe(true);
  });

  it("normalizes payload", () => {
    const body = JSON.stringify({
      eventId: "evt-1",
      eventType: "order.created",
      orgId: "org-1",
    });
    expect(adapter.normalize(body)).toEqual(
      expect.objectContaining({
        externalEventId: "evt-1",
        eventType: "order.created",
        orgId: "org-1",
      }),
    );
  });
});

describe("stripe adapter", () => {
  const secret = "whsec_test";
  const adapter = createStripeWebhookAdapter(secret);

  it("verifies stripe signature header", () => {
    const body = JSON.stringify({
      id: "evt_stripe_1",
      type: "payment_intent.succeeded",
      data: { object: { metadata: { org_id: "org-1" } } },
    });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signed = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
    const header = `t=${timestamp},v1=${signed}`;
    expect(adapter.verify(body, { "stripe-signature": header })).toBe(true);
  });
});

describe("createWebhooksService", () => {
  it("returns duplicate for same external event id", async () => {
    const { createWebhooksService } = await import("./service");

    const insertReceipt = vi
      .fn()
      .mockResolvedValueOnce({
        row: {
          id: "r1",
          orgId: "org-1",
          provider: "generic",
          externalEventId: "evt-1",
          eventType: "test",
          status: "received",
          payload: {},
          error: null,
          createdAt: new Date(),
          processedAt: null,
        },
        duplicate: false,
      })
      .mockResolvedValueOnce({
        row: {
          id: "r1",
          orgId: "org-1",
          provider: "generic",
          externalEventId: "evt-1",
          eventType: "test",
          status: "received",
          payload: {},
          error: null,
          createdAt: new Date(),
          processedAt: null,
        },
        duplicate: true,
      });

    const add = vi.fn(async () => ({ id: "job-1" }));
    const service = createWebhooksService({
      storage: {
        insertReceipt,
        updateReceipt: vi.fn(),
        findReceipt: vi.fn(),
        listSubscriptions: vi.fn(),
        findSubscription: vi.fn(),
        insertSubscription: vi.fn(),
        updateSubscription: vi.fn(),
        deleteSubscription: vi.fn(),
        listEnabledSubscriptions: vi.fn(),
        insertOutboundDelivery: vi.fn(),
        updateOutboundDelivery: vi.fn(),
        findOutboundDelivery: vi.fn(),
        findOutboundDeliveryForOrg: vi.fn(),
        listOutboundDeliveries: vi.fn(),
      },
      inboundQueue: { add } as never,
      outboundQueue: { add: vi.fn() } as never,
      secrets: {
        putOrgSecret: vi.fn(),
        hasOrgSecret: vi.fn(async () => false),
      },
    });

    process.env.WEBHOOK_GENERIC_SECRET = "test-generic-secret";

    const body = JSON.stringify({ eventId: "evt-1", eventType: "test", orgId: "org-1" });
    const signature = `sha256=${createHmac("sha256", "test-generic-secret").update(body).digest("hex")}`;
    const headers = { "x-webhook-signature": signature };

    const first = await service.handleInbound("generic", body, headers);
    const second = await service.handleInbound("generic", body, headers);

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(add).toHaveBeenCalledTimes(1);

    delete process.env.WEBHOOK_GENERIC_SECRET;
  });
});

describe("signOutboundWebhook", () => {
  it("produces Standard Webhooks headers", async () => {
    const { signOutboundWebhook } = await import("./signing");
    const body = JSON.stringify({ type: "order.paid", id: "evt-1", data: {} });
    const headers = signOutboundWebhook("secret", "evt-1", 1_700_000_000, body);
    expect(headers["webhook-id"]).toBe("evt-1");
    expect(headers["webhook-timestamp"]).toBe("1700000000");
    expect(headers["webhook-signature"]).toMatch(/^v1,/);
  });
});

describe("deliverOutbound", () => {
  it("queues one delivery per matching subscription", async () => {
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
      inboundQueue: { add: vi.fn() } as never,
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

describe("registerWebhookInboundRouter", () => {
  it("calls machine transition when payload includes machine hints", async () => {
    const { registerWebhookInboundRouter } = await import("./inbound-router");
    const transition = vi.fn(async () => ({
      id: "inst-1",
      orgId: "org-1",
      machineName: "checkout",
      currentState: "paid",
      context: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    const handlers: Array<(payload: unknown) => Promise<void>> = [];

    registerWebhookInboundRouter({
      machines: { transition },
      subscribe: (_event, handler) => {
        handlers.push(handler);
      },
    });

    expect(handlers).toHaveLength(1);
    await handlers[0]!({
      orgId: "org-1",
      receiptId: "r1",
      provider: "generic",
      eventType: "payment.succeeded",
      payload: {
        machine_instance_id: "inst-1",
        machine_event: "PAYMENT_RECEIVED",
        machine_params: { amount: 100 },
      },
    });

    expect(transition).toHaveBeenCalledWith("org-1", "inst-1", "PAYMENT_RECEIVED", { amount: 100 });
  });
});

describe("createWebhookOrgResolver", () => {
  it("resolves orgId from OAuth connectionId", async () => {
    const { createWebhookOrgResolver } = await import("./resolve-org");
    const resolve = createWebhookOrgResolver({
      findOrgIdByOAuthConnectionId: vi.fn(async () => "org-from-conn"),
    });

    await expect(resolve({ connectionId: "conn-123", provider: "stripe" })).resolves.toBe(
      "org-from-conn",
    );
  });

  it("prefers explicit orgId", async () => {
    const { createWebhookOrgResolver } = await import("./resolve-org");
    const lookup = vi.fn(async () => "org-from-conn");
    const resolve = createWebhookOrgResolver({ findOrgIdByOAuthConnectionId: lookup });

    await expect(
      resolve({ orgId: "org-direct", connectionId: "conn-123", provider: "stripe" }),
    ).resolves.toBe("org-direct");
    expect(lookup).not.toHaveBeenCalled();
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

  it("delivers webhook.received for inbound events", async () => {
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

    const webhookHandlers = handlers.get("webhook.received") ?? [];
    await webhookHandlers[0]!({
      orgId: "org-1",
      receiptId: "r1",
      provider: "stripe",
      eventType: "payment_intent.succeeded",
      payload: { id: "pi_1" },
    });

    expect(deliverOutbound).toHaveBeenCalledWith(
      "org-1",
      "webhook.received",
      expect.objectContaining({
        receiptId: "r1",
        provider: "stripe",
      }),
      "inbound:stripe:r1",
    );
  });
});

describe("retryOutboundDelivery", () => {
  it("requeues failed delivery", async () => {
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
      inboundQueue: { add: vi.fn() } as never,
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
