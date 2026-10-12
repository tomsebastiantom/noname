import { describe, expect, it, vi } from "vitest";
import {
  createCommerceCapabilities,
  createCommerceProviderEventMappings,
  createRefundProviderRegistry,
  createStripeRefundAdapter,
  type RefundProviderAdapter,
} from "./capabilities";

const ORDER_ID = "00000000-0000-4000-8000-0000000000aa";
const CONTEXT = { orgId: "org-1", requestId: "request-1", idempotencyKey: "attempt-1" };

type Order = {
  id: string;
  machineName: string;
  currentState: string;
  context: Record<string, unknown>;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
};

function paidOrder(overrides: Record<string, unknown> = {}): Order {
  return {
    id: ORDER_ID,
    machineName: "cart",
    currentState: "paid",
    context: {
      orderRef: "order:test",
      paymentRef: "pi_123",
      checkoutProvider: "stripe",
      checkoutCurrency: "CAD",
      checkoutSnapshot: { currency: "CAD", minorUnitExponent: 2, totalMinor: 1299, lines: [] },
      ...overrides,
    },
    revision: 1,
    createdAt: new Date("2026-10-01T12:00:00Z"),
    updatedAt: new Date("2026-10-01T12:00:00Z"),
  };
}

function harness(order: Order, refundProviders?: Record<string, RefundProviderAdapter>) {
  let current = order;
  const transition = vi.fn(
    async (_orgId: string, _id: string, event: string, params: Record<string, unknown>) => {
      current = {
        ...current,
        currentState: event === "REFUND_ORDER" ? "refund_pending" : current.currentState,
        context: { ...current.context, ...params },
        revision: current.revision + 1,
        updatedAt: new Date(),
      };
      return current;
    },
  );

  const capabilities = createCommerceCapabilities({
    machines: { getInstance: async () => current, transition },
    integrations: { proxyProvider: (async () => ({})) as never },
    checkoutProviders: {},
    ...(refundProviders ? { refundProviders } : {}),
  });

  return { capabilities, transition, currentOrder: () => current };
}

describe("commerce.orders.refund", () => {
  it("fails closed instead of entering refund_pending without a provider reference", async () => {
    // Without a provider reference the refund could never be confirmed, so the
    // order would be stuck in refund_pending forever.
    const { capabilities, transition } = harness(paidOrder({ paymentRef: undefined }));

    await expect(
      capabilities["commerce.orders.refund"]({ orderId: ORDER_ID, expectedRevision: 1 }, CONTEXT),
    ).rejects.toThrow(/no provider payment reference/i);
    expect(transition).not.toHaveBeenCalled();
  });

  it("submits the refund and records the provider reference on the transition", async () => {
    const createRefund = vi.fn(async () => ({ refundReference: "re_1", status: "pending" }));
    const { capabilities, transition } = harness(paidOrder(), {
      stripe: { createRefund } as RefundProviderAdapter,
    });

    const result = await capabilities["commerce.orders.refund"](
      { orderId: ORDER_ID, expectedRevision: 1, amountMinor: 500, reason: "customer request" },
      CONTEXT,
    );

    expect(createRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentReference: "pi_123",
        amountMinor: 500,
        integrationId: "stripe",
        machineInstanceId: ORDER_ID,
        idempotencyKey: `commerce-refund:${ORDER_ID}:1`,
      }),
      expect.anything(),
    );
    expect(transition).toHaveBeenCalledWith(
      "org-1",
      ORDER_ID,
      "REFUND_ORDER",
      expect.objectContaining({ refundReference: "re_1", amountMinor: 500, currency: "CAD" }),
      1,
    );
    expect(result).toMatchObject({ id: ORDER_ID, status: "refund_pending" });
  });

  it("rejects a refund larger than the captured amount", async () => {
    const { capabilities, transition } = harness(paidOrder(), {
      stripe: { createRefund: vi.fn() } as unknown as RefundProviderAdapter,
    });

    await expect(
      capabilities["commerce.orders.refund"](
        { orderId: ORDER_ID, expectedRevision: 1, amountMinor: 99999 },
        CONTEXT,
      ),
    ).rejects.toThrow(/exceeds the captured amount/i);
    expect(transition).not.toHaveBeenCalled();
  });

  it("refuses to refund an order that is not paid", async () => {
    const order = { ...paidOrder(), currentState: "cancelled" };
    const { capabilities, transition } = harness(order, {
      stripe: { createRefund: vi.fn() } as unknown as RefundProviderAdapter,
    });

    await expect(
      capabilities["commerce.orders.refund"]({ orderId: ORDER_ID, expectedRevision: 1 }, CONTEXT),
    ).rejects.toThrow(/only a paid order/i);
    expect(transition).not.toHaveBeenCalled();
  });

  it("reports a clear error when no refund provider is configured", async () => {
    const { capabilities } = harness(paidOrder());

    await expect(
      capabilities["commerce.orders.refund"]({ orderId: ORDER_ID, expectedRevision: 1 }, CONTEXT),
    ).rejects.toThrow(/refund provider is not configured/i);
  });
});

describe("Stripe refund adapter", () => {
  it("posts to /v1/refunds with correlation metadata and an idempotency key", async () => {
    const proxy = vi.fn(async (_input: unknown) => ({ id: "re_9", status: "succeeded" }));
    const adapter = createStripeRefundAdapter();

    const result = await adapter.createRefund(
      {
        orgId: "org-1",
        integrationId: "stripe",
        paymentReference: "pi_123",
        amountMinor: 1299,
        idempotencyKey: "commerce-refund:order:1",
        machineInstanceId: ORDER_ID,
        orderRef: "order:test",
      },
      proxy as never,
    );

    expect(result).toEqual({ refundReference: "re_9", status: "succeeded" });
    const call = proxy.mock.calls[0]?.[0] as unknown as {
      endpoint: string;
      headers: Record<string, string>;
      data: string;
    };
    expect(call.endpoint).toBe("/v1/refunds");
    expect(call.headers["Idempotency-Key"]).toBe("commerce-refund:order:1");
    expect(call.data).toContain("payment_intent=pi_123");
    expect(call.data).toContain("amount=1299");
    expect(call.data).toContain(`metadata%5BmachineInstanceId%5D=${ORDER_ID}`);
  });

  it("rejects an invalid provider response rather than reporting success", async () => {
    const adapter = createStripeRefundAdapter();
    await expect(
      adapter.createRefund(
        {
          orgId: "org-1",
          integrationId: "stripe",
          paymentReference: "pi_123",
          idempotencyKey: "k",
          machineInstanceId: ORDER_ID,
          orderRef: "order:test",
        },
        (async () => ({})) as never,
      ),
    ).rejects.toThrow(/invalid refund/i);
  });

  it("registry lookup is case-insensitive on the provider name", () => {
    const registry = createRefundProviderRegistry({ Stripe: createStripeRefundAdapter() });
    expect(registry.stripe).toBeDefined();
    expect(registry.STRIPE).toBeUndefined();
  });
});

describe("refund provider event mappings", () => {
  const mappings = createCommerceProviderEventMappings();
  const mappingFor = (eventType: string) => {
    const found = mappings.find((mapping) => mapping.eventType === eventType);
    if (!found) throw new Error(`no mapping registered for ${eventType}`);
    return found.normalize;
  };

  const forwarded = (eventType: string, payload: Record<string, unknown>) => ({
    orgId: "org-1",
    integrationId: "stripe",
    connectionId: "conn-1",
    eventType,
    payload,
  });

  it("maps a succeeded refund to REFUND_CONFIRMED", () => {
    const normalized = mappingFor("refund.updated")(
      forwarded("refund.updated", {
        id: "re_1",
        status: "succeeded",
        amount: 1299,
        currency: "cad",
        metadata: { machineInstanceId: ORDER_ID },
      }),
    );
    expect(normalized).toMatchObject({
      event: "REFUND_CONFIRMED",
      machineInstanceId: ORDER_ID,
      params: { refundReference: "re_1" },
    });
  });

  it("maps a failed refund to REFUND_FAILED", () => {
    const normalized = mappingFor("refund.failed")(
      forwarded("refund.failed", {
        id: "re_2",
        status: "failed",
        metadata: { machineInstanceId: ORDER_ID },
      }),
    );
    expect(normalized).toMatchObject({ event: "REFUND_FAILED", machineInstanceId: ORDER_ID });
  });

  it("does not transition on a pending refund", () => {
    // Marking an order refunded before the provider confirms would be a lie.
    expect(
      mappingFor("refund.updated")(
        forwarded("refund.updated", {
          id: "re_3",
          status: "pending",
          metadata: { machineInstanceId: ORDER_ID },
        }),
      ),
    ).toBeNull();
  });

  it("ignores a refund it cannot attribute to an order", () => {
    expect(
      mappingFor("refund.updated")(
        forwarded("refund.updated", { id: "re_4", status: "succeeded" }),
      ),
    ).toBeNull();
  });

  it("treats a refunded charge as confirmed", () => {
    expect(
      mappingFor("charge.refunded")(
        forwarded("charge.refunded", {
          refunded: true,
          amount_refunded: 1299,
          metadata: { machineInstanceId: ORDER_ID },
        }),
      ),
    ).toMatchObject({ event: "REFUND_CONFIRMED" });
  });

  it("keeps the payment mappings intact", () => {
    expect(
      mappingFor("checkout.session.completed")(
        forwarded("checkout.session.completed", {
          payment_status: "paid",
          amount_total: 1299,
          currency: "cad",
          metadata: { machineInstanceId: ORDER_ID },
        }),
      ),
    ).toMatchObject({ event: "PAYMENT_SUCCEEDED" });
  });
});
