import { beforeEach, describe, expect, it, vi } from "vitest";
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
