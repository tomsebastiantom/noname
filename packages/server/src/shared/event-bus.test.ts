import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * S7: `dispatchLocal` was `try { await h(payload) } catch { /* fire-and-forget *\/ }`, so a
 * subscriber could throw on every single event with no log, no counter and no health signal
 * anywhere — the failure was indistinguishable from the event never being published at all.
 * These tests pin that a throwing subscriber is reported and does not stop the others.
 */

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("event bus subscriber failures", () => {
  // Explicit timeout: `await import("./event-bus")` pulls in ioredis, so the *module load* — not the
  // assertion — is what can exceed the 5s default when many test files import the Redis client at once.
  // Without this the file flakes (observed ~1 run in 3) with no assertion ever failing.
  it("logs a throwing subscriber and still notifies the remaining subscribers", {
    timeout: 20_000,
  }, async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { eventBus } = await import("./event-bus");
    const healthy = vi.fn(async () => undefined);

    eventBus.subscribe("order.created", async () => {
      throw new Error("projection exploded");
    });
    eventBus.subscribe("order.created", healthy);

    // Publish must still resolve: subscriber failures are non-fatal by design.
    await expect(eventBus.publish("order.created", { id: 1 })).resolves.toBeUndefined();

    expect(healthy).toHaveBeenCalledTimes(1);
    const logged = errorSpy.mock.calls.some((call) => String(call[0]).includes("order.created"));
    expect(logged).toBe(true);
  });

  it("does not reject when a subscriber throws, so void-ed publishes stay safe", {
    timeout: 20_000,
  }, async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { eventBus } = await import("./event-bus");
    eventBus.subscribe("payment.captured", async () => {
      throw new Error("listener down");
    });

    await expect(eventBus.publish("payment.captured", {})).resolves.toBeUndefined();
  });
});
