import { afterEach, describe, expect, it, vi } from "vitest";
import {
  closeAllBullmqWorkers,
  registerBullmqWorker,
  registeredBullmqWorkerCount,
  resetBullmqWorkersForTests,
} from "./bullmq-workers";

/**
 * §5.7: shutdown closed the queue objects but never the `Worker` instances that `RUN_WORKERS=true`
 * puts in the API process, so in-flight jobs were abandoned mid-execution. The property that
 * matters is not "close was called" — a fire-and-forget `void worker.close()` would also satisfy
 * that — but that shutdown *waits* for it, because `close()` is what lets the active job finish.
 */

afterEach(() => {
  resetBullmqWorkersForTests();
  vi.restoreAllMocks();
});

describe("bullmq worker drain", () => {
  it("closes every registered worker and clears the registry", async () => {
    const a = { close: vi.fn(async () => undefined) };
    const b = { close: vi.fn(async () => undefined) };
    registerBullmqWorker(a);
    registerBullmqWorker(b);
    expect(registeredBullmqWorkerCount()).toBe(2);

    await closeAllBullmqWorkers();

    expect(a.close).toHaveBeenCalledTimes(1);
    expect(b.close).toHaveBeenCalledTimes(1);
    expect(registeredBullmqWorkerCount()).toBe(0);
  });

  it("waits for an in-flight job to finish instead of abandoning it", async () => {
    let jobFinished = false;
    let releaseClose: (() => void) | undefined;
    const worker = {
      close: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            // Models BullMQ: close() resolves only once the current job completes.
            releaseClose = () => {
              jobFinished = true;
              resolve();
            };
          }),
      ),
    };
    registerBullmqWorker(worker);

    let drainResolved = false;
    const drain = closeAllBullmqWorkers().then(() => {
      drainResolved = true;
    });

    // Give the microtask queue a chance: a fire-and-forget drain would already have settled.
    await Promise.resolve();
    await Promise.resolve();
    expect(drainResolved).toBe(false);
    expect(jobFinished).toBe(false);

    releaseClose?.();
    await drain;
    expect(drainResolved).toBe(true);
    expect(jobFinished).toBe(true);
  });

  it("still drains the other workers when one fails to close", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const failing = { close: vi.fn(async () => Promise.reject(new Error("close failed"))) };
    const healthy = { close: vi.fn(async () => undefined) };
    registerBullmqWorker(failing);
    registerBullmqWorker(healthy);

    await expect(closeAllBullmqWorkers()).resolves.toBeUndefined();

    expect(healthy.close).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("resolves immediately when nothing is registered", async () => {
    await expect(closeAllBullmqWorkers()).resolves.toBeUndefined();
  });

  it("does not close the same worker twice", async () => {
    const worker = { close: vi.fn(async () => undefined) };
    registerBullmqWorker(worker);

    await closeAllBullmqWorkers();
    await closeAllBullmqWorkers();

    expect(worker.close).toHaveBeenCalledTimes(1);
  });

  it("accepts a worker whose job data type differs (Worker<T> is invariant)", () => {
    // Compile-time property, asserted here so a future `Set<Worker<unknown>>` regression is caught:
    // two differently-typed workers must both be registrable.
    type FakeWorker<T> = { close(): Promise<void>; __jobData?: T };
    const emailWorker: FakeWorker<{ to: string }> = { close: async () => undefined };
    const webhookWorker: FakeWorker<{ url: string }> = { close: async () => undefined };

    registerBullmqWorker(emailWorker);
    registerBullmqWorker(webhookWorker);

    expect(registeredBullmqWorkerCount()).toBe(2);
  });
});
