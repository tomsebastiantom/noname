import { afterEach, describe, expect, it, vi } from "vitest";
import { eventBus } from "../../shared/event-bus";
import { MachineEvents } from "./events";
import type { MachineStorage, PendingTransition } from "./ports";
import { createTransitionRelay } from "./transition-relay";

/**
 * The relay is the second half of the outbox: `commitTransition` already writes the transition row in the
 * same transaction as the state change, so the durable record exists. `published_at` is what makes it
 * possible to tell which rows were delivered, and this loop re-publishes the rest.
 *
 * Properties under test, in order of importance:
 *   1. an undelivered transition is published (the whole point)
 *   2. it is marked afterwards, so the next pass does not publish it again (no duplicate storm)
 *   3. a row that cannot be routed is retired rather than retried forever
 *   4. passes never overlap
 *   5. stop() waits for an in-flight pass instead of abandoning a half-marked batch
 */

function pending(overrides: Partial<PendingTransition> = {}): PendingTransition {
  return {
    id: "t-1",
    instanceId: "inst-1",
    orgId: "org-1",
    revision: 2,
    event: "checkout",
    fromState: "active",
    toState: "awaiting_payment",
    params: { probe: true },
    ...overrides,
  };
}

function fakeStorage(rows: PendingTransition[]) {
  const markTransitionPublished = vi.fn(async () => undefined);
  const listUnpublishedTransitions = vi.fn(async () => rows);
  const storage = {
    markTransitionPublished,
    listUnpublishedTransitions,
  } as unknown as MachineStorage;
  return { storage, markTransitionPublished, listUnpublishedTransitions };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("machine transition relay", () => {
  it("republishes an undelivered transition with its full payload", async () => {
    const publish = vi.spyOn(eventBus, "publish").mockResolvedValue(undefined);
    const { storage } = fakeStorage([pending()]);
    const relay = createTransitionRelay(storage, { settleMs: 0, intervalMs: 1_000 });

    await expect(relay.runOnce()).resolves.toBe(1);

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(MachineEvents.TRANSITION, {
      orgId: "org-1",
      instanceId: "inst-1",
      event: "checkout",
      fromState: "active",
      toState: "awaiting_payment",
      params: { probe: true },
      revision: 2,
    });
  });

  it("marks the transition published so a later pass does not publish it again", async () => {
    const publish = vi.spyOn(eventBus, "publish").mockResolvedValue(undefined);
    const { storage, markTransitionPublished, listUnpublishedTransitions } = fakeStorage([
      pending(),
    ]);
    const relay = createTransitionRelay(storage, { settleMs: 0, intervalMs: 1_000 });

    await relay.runOnce();
    expect(markTransitionPublished).toHaveBeenCalledWith("inst-1", 2);

    // The store now reports nothing pending — the marker is what makes that true in the real adapter.
    listUnpublishedTransitions.mockResolvedValueOnce([]);
    await relay.runOnce();
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("retires a transition it cannot route instead of retrying forever", async () => {
    const publish = vi.spyOn(eventBus, "publish").mockResolvedValue(undefined);
    // Pre-migration rows have no orgId: publishing them would deliver an event no subscriber can
    // attribute to a tenant, so they are marked and skipped rather than blocking the batch forever.
    const { storage, markTransitionPublished } = fakeStorage([pending({ orgId: null })]);
    const relay = createTransitionRelay(storage, { settleMs: 0, intervalMs: 1_000 });

    await expect(relay.runOnce()).resolves.toBe(0);
    expect(publish).not.toHaveBeenCalled();
    expect(markTransitionPublished).toHaveBeenCalledWith("inst-1", 2);
  });

  it("leaves a transition unmarked when publishing throws, so it is retried", async () => {
    vi.spyOn(eventBus, "publish").mockRejectedValue(new Error("redis down"));
    const { storage, markTransitionPublished } = fakeStorage([pending()]);
    const relay = createTransitionRelay(storage, { settleMs: 0, intervalMs: 1_000 });

    await expect(relay.runOnce()).rejects.toThrow("redis down");
    expect(markTransitionPublished).not.toHaveBeenCalled();
  });

  it("does not run overlapping passes", async () => {
    vi.spyOn(eventBus, "publish").mockResolvedValue(undefined);
    let release: (() => void) | undefined;
    const { storage } = fakeStorage([pending()]);
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const listUnpublishedTransitions = vi
      .spyOn(storage, "listUnpublishedTransitions")
      .mockImplementation(async () => {
        await gate;
        return [pending()];
      });
    const relay = createTransitionRelay(storage, { settleMs: 0, intervalMs: 10 });

    relay.start();
    // The first pass is blocked on the gate; several intervals elapse meanwhile.
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(listUnpublishedTransitions).toHaveBeenCalledTimes(1);

    release?.();
    await relay.stop();
  });

  it("waits for an in-flight pass on stop()", async () => {
    vi.spyOn(eventBus, "publish").mockResolvedValue(undefined);
    let markStarted = false;
    let markCompleted = false;
    const { storage } = fakeStorage([pending()]);
    vi.spyOn(storage, "markTransitionPublished").mockImplementation(async () => {
      markStarted = true;
      await new Promise((resolve) => setTimeout(resolve, 30));
      markCompleted = true;
    });
    const relay = createTransitionRelay(storage, { settleMs: 0, intervalMs: 10 });

    relay.start();
    await vi.waitFor(() => expect(markStarted).toBe(true));
    await relay.stop();

    // The property is that stop() did not return while the mark was still running, so a shutdown cannot
    // abandon a batch half-marked. Asserting completion (not a call count) keeps this robust to extra
    // passes the 10ms interval may have started.
    expect(markCompleted).toBe(true);
  });
});
