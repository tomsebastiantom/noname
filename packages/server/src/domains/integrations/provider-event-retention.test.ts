import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProviderEventReceiptStore } from "./provider-event-receipts";
import {
  providerEventReceiptRetentionMs,
  providerEventReceiptSweepIntervalMs,
  resetProviderEventReceiptRetentionForTests,
  setProviderEventReceiptRetentionClock,
  sweepProviderEventReceipts,
} from "./provider-event-retention";

/**
 * S15: `provider_event_receipts` has no expiry column at all — a receipt existed purely to answer
 * "have I seen this event key before?", and was kept forever. The retention window is therefore also
 * the dedup window, which is the trade these tests document.
 */

const originals = {
  retention: process.env.PROVIDER_EVENT_RECEIPT_RETENTION_DAYS,
  interval: process.env.PROVIDER_EVENT_RECEIPT_SWEEP_INTERVAL_MS,
};

afterEach(() => {
  resetProviderEventReceiptRetentionForTests();
  for (const [key, value] of [
    ["PROVIDER_EVENT_RECEIPT_RETENTION_DAYS", originals.retention],
    ["PROVIDER_EVENT_RECEIPT_SWEEP_INTERVAL_MS", originals.interval],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.restoreAllMocks();
});

function storeWith(deleteImpl: (cutoff: Date) => Promise<number>) {
  const deleteOlderThan = vi.fn(deleteImpl);
  const store = { deleteOlderThan } as unknown as ProviderEventReceiptStore;
  return { store, deleteOlderThan };
}

describe("provider event receipt retention", () => {
  it("deletes receipts created before the retention cutoff", async () => {
    const fixedNow = Date.UTC(2026, 9, 15, 12, 0, 0);
    setProviderEventReceiptRetentionClock(() => fixedNow);
    process.env.PROVIDER_EVENT_RECEIPT_RETENTION_DAYS = "30";
    const { store, deleteOlderThan } = storeWith(async () => 6);

    await expect(sweepProviderEventReceipts(store)).resolves.toBe(6);

    const cutoff = deleteOlderThan.mock.calls[0]?.[0] as Date;
    expect(cutoff.getTime()).toBe(fixedNow - 30 * 86_400_000);
  });

  it("defaults to a 30-day window — far beyond any provider redelivery", () => {
    delete process.env.PROVIDER_EVENT_RECEIPT_RETENTION_DAYS;
    expect(providerEventReceiptRetentionMs()).toBe(30 * 86_400_000);
  });

  it("defaults the sweep interval to an hour", () => {
    delete process.env.PROVIDER_EVENT_RECEIPT_SWEEP_INTERVAL_MS;
    expect(providerEventReceiptSweepIntervalMs()).toBe(3_600_000);
  });

  it("never fails the caller when the delete fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { store } = storeWith(async () => {
      throw new Error("statement timeout");
    });

    await expect(sweepProviderEventReceipts(store)).resolves.toBe(0);
  });
});
