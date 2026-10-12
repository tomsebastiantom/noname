import { describe, expect, it, vi } from "vitest";
import { type ListenableServer, listenWithRetry } from "./listen-with-retry";

/** Minimal fake server whose first `busyCount` bind attempts fail with EADDRINUSE. */
function fakeServerFactory(options: { busyCount: number; errorCode?: string }) {
  let created = 0;
  const closed: number[] = [];

  const createServer = (): ListenableServer & { id: number } => {
    created += 1;
    const id = created;
    const handlers: Record<string, (arg?: unknown) => void> = {};
    const server = {
      id,
      once(event: string, listener: (arg?: unknown) => void) {
        handlers[event] = listener;
        // Emit on the next microtask so both listeners are registered first.
        queueMicrotask(() => {
          if (event !== "error") return;
          if (id <= options.busyCount) {
            const error = new Error("address already in use") as NodeJS.ErrnoException;
            error.code = options.errorCode ?? "EADDRINUSE";
            handlers.error?.(error);
            return;
          }
          handlers.listening?.();
        });
        return server;
      },
      close(callback?: () => void) {
        closed.push(id);
        callback?.();
        return server;
      },
    };
    return server;
  };

  return { createServer, closed, createdCount: () => created };
}

describe("listenWithRetry", () => {
  it("binds on the first attempt without sleeping", async () => {
    const factory = fakeServerFactory({ busyCount: 0 });
    const sleep = vi.fn(async () => {});
    const onRetry = vi.fn();

    const server = await listenWithRetry({
      createServer: factory.createServer,
      attempts: 5,
      delayMs: 10,
      onRetry,
      sleep,
    });

    expect(server.id).toBe(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("retries a busy port and succeeds once it is released", async () => {
    const factory = fakeServerFactory({ busyCount: 3 });
    const sleep = vi.fn(async () => {});
    const onRetry = vi.fn();

    const server = await listenWithRetry({
      createServer: factory.createServer,
      attempts: 10,
      delayMs: 10,
      onRetry,
      sleep,
    });

    // Three failures then success.
    expect(server.id).toBe(4);
    expect(sleep).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(3);
    // Failed candidates are closed so their sockets do not linger.
    expect(factory.closed).toEqual([1, 2, 3]);
  });

  it("gives up after the retry budget and surfaces the original error", async () => {
    const factory = fakeServerFactory({ busyCount: 99 });
    const sleep = vi.fn(async () => {});

    await expect(
      listenWithRetry({
        createServer: factory.createServer,
        attempts: 3,
        delayMs: 10,
        sleep,
      }),
    ).rejects.toMatchObject({ code: "EADDRINUSE" });

    // Three attempts: two retries in between, never a fourth.
    expect(factory.createdCount()).toBe(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-EADDRINUSE error", async () => {
    const factory = fakeServerFactory({ busyCount: 99, errorCode: "EACCES" });
    const sleep = vi.fn(async () => {});

    await expect(
      listenWithRetry({
        createServer: factory.createServer,
        attempts: 5,
        delayMs: 10,
        sleep,
      }),
    ).rejects.toMatchObject({ code: "EACCES" });

    expect(factory.createdCount()).toBe(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
