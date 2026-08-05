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
      storage: { insertReceipt, updateReceipt: vi.fn(), findReceipt: vi.fn() },
      queue: { add } as never,
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
