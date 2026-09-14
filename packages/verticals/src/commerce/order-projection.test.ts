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
        context: { orderRef: "order-1", checkoutAmount: 4200, checkoutCurrency: "cad" },
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
        idempotencyKey: "commerce:order:machine-1",
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
});
