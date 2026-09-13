import { describe, expect, it } from "vitest";
import { providerEventKey } from "./provider-event-receipts";
import type { ProviderForwardedEvent } from "./provider-events";

const base: ProviderForwardedEvent = {
  orgId: "org-1",
  integrationId: "stripe",
  connectionId: "connection-1",
  eventType: "checkout.session.completed",
  payload: { z: 2, nested: { b: 1, a: 0 }, a: 1 },
};

describe("providerEventKey", () => {
  it("uses the provider event identity when present", () => {
    expect(providerEventKey({ ...base, providerEventId: "evt-1" })).toBe("stripe:evt-1");
    expect(providerEventKey({ ...base, deliveryId: "delivery-1" })).toBe("stripe:delivery-1");
  });

  it("hashes payloads deterministically when no provider identity exists", () => {
    const first = providerEventKey(base);
    const second = providerEventKey({
      ...base,
      payload: { a: 1, nested: { a: 0, b: 1 }, z: 2 },
    });
    expect(first).toBe(second);
  });
});
