import { afterEach, describe, expect, it, vi } from "vitest";
import {
  beginDraining,
  isDraining,
  registerShutdownTask,
  resetLifecycleForTests,
  runShutdownTasks,
} from "./lifecycle";

/**
 * The shutdown-task registry exists because two kinds of background work need different treatment at
 * exit: BullMQ workers must be *drained* (§5.7), while debounced producers must be *stopped and flushed*.
 * The transition relay and the collab room flush both register here.
 *
 * The property that matters is that one failing task cannot strand the others — shutdown has to reach
 * `process.exit` regardless — and that tasks run exactly once.
 */

afterEach(() => {
  resetLifecycleForTests();
  vi.restoreAllMocks();
});

describe("draining flag", () => {
  it("is irreversible once shutdown begins", () => {
    expect(isDraining()).toBe(false);
    beginDraining();
    expect(isDraining()).toBe(true);
    beginDraining();
    expect(isDraining()).toBe(true);
  });
});

describe("shutdown tasks", () => {
  it("runs every registered task", async () => {
    const flush = vi.fn(async () => undefined);
    const stop = vi.fn(async () => undefined);
    registerShutdownTask("collab-flush", flush);
    registerShutdownTask("relay", stop);

    await runShutdownTasks();

    expect(flush).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("still runs the other tasks when one fails, and never throws", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const failing = vi.fn(async () => {
      throw new Error("flush exploded");
    });
    const healthy = vi.fn(async () => undefined);
    registerShutdownTask("failing", failing);
    registerShutdownTask("healthy", healthy);

    await expect(runShutdownTasks()).resolves.toBeUndefined();

    expect(healthy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it("runs tasks once, so a second shutdown attempt does not flush again", async () => {
    const flush = vi.fn(async () => undefined);
    registerShutdownTask("collab-flush", flush);

    await runShutdownTasks();
    await runShutdownTasks();

    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("resolves immediately when nothing is registered", async () => {
    await expect(runShutdownTasks()).resolves.toBeUndefined();
  });

  it("waits for a slow task rather than returning early", async () => {
    let finished = false;
    registerShutdownTask("slow-flush", async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      finished = true;
    });

    await runShutdownTasks();

    // A task that persisted nothing before the process exits would defeat the point.
    expect(finished).toBe(true);
  });
});
