import { describe, expect, it, vi } from "vitest";
import { type CommerceEvidencePort, createCommerceOrderProjector } from "./order-projection";

function evidence(): CommerceEvidencePort & {
  appendRecord: ReturnType<typeof vi.fn>;
  appendActivity: ReturnType<typeof vi.fn>;
  link: ReturnType<typeof vi.fn>;
} {
  return {
    appendRecord: vi
      .fn()
      .mockResolvedValueOnce({ id: "order-record", recordedAt: new Date() })
      .mockResolvedValueOnce({ id: "payment-record", recordedAt: new Date() }),
    appendActivity: vi.fn().mockResolvedValue({ id: "activity-record", recordedAt: new Date() }),
    link: vi.fn().mockResolvedValue({ id: "link", createdAt: new Date() }),
  };
}

describe("commerce order evidence projection", () => {
  it("emits an order, payment receipt, activity, and links after payment success", async () => {
    const store = evidence();
    const project = createCommerceOrderProjector(store);

    await project({
      orgId: "org-test",
      instance: {
        id: "machine-1",
        machineName: "cart",
        currentState: "paid",
        context: {
          orderRef: "order-1",
          paidAt: "2026-09-10T12:00:00.000Z",
          checkoutAmount: 4200,
          checkoutCurrency: "CAD",
          checkoutSnapshot: {
            currency: "CAD",
            minorUnitExponent: 2,
            totalMinor: 4200,
            lines: [
              {
                productId: "p1",
                title: "Item",
                quantity: 2,
                unitAmountMinor: 2100,
                lineAmountMinor: 4200,
              },
            ],
          },
        },
        revision: 3,
        updatedAt: new Date("2026-09-12T12:00:00Z"),
      },
      event: "PAYMENT_SUCCEEDED",
      fromState: "awaiting_payment",
      toState: "paid",
      params: { paymentRef: "pi-1", amount: 4200, currency: "cad" },
    });

    expect(store.appendRecord).toHaveBeenCalledTimes(2);
    expect(store.appendRecord).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: "commerce.order.created",
        subjectId: "order-1",
        occurredAt: new Date("2026-09-10T12:00:00.000Z"),
        idempotencyKey: "commerce:order:machine-1",
        data: expect.objectContaining({
          amountMinor: 4200,
          currency: "CAD",
          minorUnitExponent: 2,
          detailCompleteness: "complete",
          lineItems: [
            {
              productId: "p1",
              title: "Item",
              quantity: 2,
              unitAmountMinor: 2100,
              lineAmountMinor: 4200,
            },
          ],
        }),
      }),
    );
    expect(store.appendRecord).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: "commerce.payment.receipt",
        subjectId: "pi-1",
        idempotencyKey: "commerce:payment:pi-1",
      }),
    );
    expect(store.appendActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "commerce.payment_succeeded",
        inputRecordIds: ["payment-record"],
        outputRecordIds: ["order-record"],
      }),
    );
    expect(store.link).toHaveBeenCalledTimes(2);
  });

  it("ignores transitions that are not authoritative payment success", async () => {
    const store = evidence();
    const project = createCommerceOrderProjector(store);

    await project({
      orgId: "org-test",
      instance: {
        id: "machine-1",
        machineName: "cart",
        currentState: "awaiting_payment",
        context: {},
        updatedAt: new Date(),
      },
      event: "PAYMENT_FAILED",
      fromState: "awaiting_payment",
      toState: "payment_failed",
      params: {},
    });

    expect(store.appendRecord).not.toHaveBeenCalled();
    expect(store.appendActivity).not.toHaveBeenCalled();
    expect(store.link).not.toHaveBeenCalled();
  });

  it("appends actor/reason evidence for manual cancellation and fulfillment", async () => {
    const store = evidence();
    const project = createCommerceOrderProjector(store);
    const instance = {
      id: "machine-1",
      machineName: "cart",
      currentState: "cancelled",
      context: { orderRef: "order-1" },
      revision: 4,
      updatedAt: new Date("2026-09-12T12:00:00Z"),
    };

    await project({
      orgId: "org-test",
      instance,
      event: "CANCEL_ORDER",
      fromState: "paid",
      toState: "cancelled",
      params: { actorId: "staff-1", reason: "Customer request" },
    });

    expect(store.appendRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "commerce.order.cancelled",
        subjectId: "order-1",
        data: expect.objectContaining({ actorId: "staff-1", reason: "Customer request" }),
      }),
    );
    expect(store.appendActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "commerce.order.cancelled",
        actorType: "user",
        actorId: "staff-1",
      }),
    );
  });

  it("distinguishes the workflow from the transition that caused a record", async () => {
    // `correlationId` groups everything about this order; `causationId` names the immediate predecessor.
    // Both used to be the instance id, which made "which transition produced this?" unanswerable and read
    // as though the record caused itself. They must differ, and causation must be the transition's own
    // identity (`{instanceId}:{revision}`) — the same value the Evidence idempotency key uses.
    const store = evidence();
    const project = createCommerceOrderProjector(store);

    await project({
      orgId: "org-test",
      instance: {
        id: "machine-1",
        machineName: "cart",
        currentState: "fulfilled",
        context: { orderRef: "order-1" },
        revision: 4,
        updatedAt: new Date("2026-09-12T12:00:00Z"),
      },
      event: "MARK_FULFILLED",
      fromState: "paid",
      toState: "fulfilled",
      params: { actorId: "staff-1" },
    });

    const appended = store.appendRecord.mock.calls[0]?.[0] as
      | { correlationId?: string; causationId?: string }
      | undefined;
    expect(appended?.correlationId).toBe("machine-1");
    expect(appended?.causationId).toBe("machine-1:4");
    expect(appended?.causationId).not.toBe(appended?.correlationId);
  });
});
