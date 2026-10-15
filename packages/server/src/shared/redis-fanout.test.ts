import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRedisFanout, REDIS_FANOUT_PUBLISH_TIMEOUT_MS } from "./redis-fanout";
import { getRedisFanoutStatus, resetRedisFanoutStatusForTests } from "./redis-fanout-status";

/**
 * These pin the two properties the three hand-rolled fan-out copies lacked:
 * liveness that can actually go down and come back, and a publish that can neither
 * reject into a `void`-ed call site (which Node turns into a process-killing unhandled
 * rejection) nor block a request indefinitely behind `maxRetriesPerRequest: null`.
 */

/** How the fake connection answers `publish`. Reset per test. */
let publishImpl: () => Promise<unknown> = async () => 1;

class FakeConnection extends EventEmitter {
  subscribe = vi.fn(async () => 1);
  publish = vi.fn((_channel: string, _message: string) => publishImpl());
}

function buildFanout(onMessage: (raw: string) => void = () => undefined) {
  const created: FakeConnection[] = [];
  const fanout = createRedisFanout({
    name: "test-fanout",
    channel: "test:channel",
    consequence: "nothing syncs across replicas",
    onMessage,
    createConnection: () => {
      const connection = new FakeConnection();
      created.push(connection);
      return connection;
    },
  });
  return { fanout, created, publisher: created[0], subscriber: created[1] };
}

const silent = () => vi.spyOn(console, "error").mockImplementation(() => undefined);
const silentWarn = () => vi.spyOn(console, "warn").mockImplementation(() => undefined);

describe("redis fan-out", () => {
  beforeEach(() => {
    resetRedisFanoutStatusForTests();
    publishImpl = async () => 1;
  });

  afterEach(() => {
    resetRedisFanoutStatusForTests();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("is inactive until every connection is ready, then active", () => {
    const errorSpy = silent();
    const warnSpy = silentWarn();
    const { fanout, publisher, subscriber } = buildFanout();

    // Constructed but not connected: previously this already reported healthy, because the check
    // was "does a publisher object exist".
    expect(fanout.isActive()).toBe(false);
    expect(getRedisFanoutStatus().subsystems["test-fanout"]).toBe(false);

    publisher.emit("ready");
    expect(fanout.isActive()).toBe(false); // one of two is not enough

    subscriber.emit("ready");
    expect(fanout.isActive()).toBe(true);
    expect(getRedisFanoutStatus().subsystems["test-fanout"]).toBe(true);
    expect(getRedisFanoutStatus().degraded).toBe(false);

    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("goes degraded when a connection drops, and recovers when it is ready again", () => {
    const errorSpy = silent();
    const warnSpy = silentWarn();
    const { fanout, publisher, subscriber } = buildFanout();
    publisher.emit("ready");
    subscriber.emit("ready");
    expect(fanout.isActive()).toBe(true);

    // The case the old code could never represent: Redis dying after a healthy boot.
    subscriber.emit("close");
    expect(fanout.isActive()).toBe(false);
    expect(getRedisFanoutStatus().degraded).toBe(true);
    expect(errorSpy).toHaveBeenCalled();

    subscriber.emit("ready");
    expect(fanout.isActive()).toBe(true);
    expect(getRedisFanoutStatus().degraded).toBe(false);

    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("reports degraded when connection construction throws, instead of throwing out of init", () => {
    const errorSpy = silent();
    const fanout = createRedisFanout({
      name: "test-fanout",
      channel: "test:channel",
      consequence: "nothing syncs across replicas",
      onMessage: () => undefined,
      createConnection: () => {
        throw new Error("connection refused");
      },
    });

    expect(fanout.isActive()).toBe(false);
    expect(getRedisFanoutStatus().subsystems["test-fanout"]).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("marks the subsystem degraded when the subscription fails", async () => {
    const errorSpy = silent();
    // The subscription is issued during construction, so the failure has to be wired into the
    // factory — setting it on the instance afterwards would be too late to be observed.
    let created = 0;
    const connections: FakeConnection[] = [];
    const fanout = createRedisFanout({
      name: "test-fanout",
      channel: "test:channel",
      consequence: "nothing syncs across replicas",
      onMessage: () => undefined,
      createConnection: () => {
        const connection = new FakeConnection();
        if (created++ === 1) {
          connection.subscribe.mockRejectedValueOnce(new Error("READONLY"));
        }
        connections.push(connection);
        return connection;
      },
    });

    connections[0].emit("ready");
    connections[1].emit("ready");

    await vi.waitFor(() => expect(fanout.isActive()).toBe(false));
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("never rejects a publish, so a void-ed call cannot become an unhandled rejection", async () => {
    const errorSpy = silent();
    const warnSpy = silentWarn();
    const { fanout, publisher, subscriber } = buildFanout();
    publisher.emit("ready");
    subscriber.emit("ready");
    publishImpl = async () => {
      throw new Error("redis went away");
    };

    await expect(fanout.publish({ event: "x" })).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("gives up on a publish that never settles rather than blocking the caller forever", async () => {
    vi.useFakeTimers();
    const errorSpy = silent();
    const warnSpy = silentWarn();
    const { fanout, publisher, subscriber } = buildFanout();
    publisher.emit("ready");
    subscriber.emit("ready");
    // `maxRetriesPerRequest: null` means ioredis queues commands while offline instead of
    // failing them, so this promise can genuinely never settle.
    publishImpl = () => new Promise(() => undefined);

    const pending = fanout.publish({ event: "x" });
    await vi.advanceTimersByTimeAsync(REDIS_FANOUT_PUBLISH_TIMEOUT_MS + 10);

    await expect(pending).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("is a no-op before any connection exists", async () => {
    const fanout = createRedisFanout({
      name: "never-connected",
      channel: "test:channel",
      consequence: "nothing syncs",
      onMessage: () => undefined,
      createConnection: () => {
        throw new Error("no redis");
      },
    });
    await expect(fanout.publish({ event: "x" })).resolves.toBeUndefined();
  });

  it("logs a connection error once per outage, not once per retry attempt", () => {
    const errorSpy = silent();
    const warnSpy = silentWarn();
    const { publisher, subscriber } = buildFanout();
    publisher.emit("ready");
    subscriber.emit("ready");

    // ioredis retries forever with backoff and emits `error` on every attempt; logging each one
    // floods the log during a sustained outage.
    publisher.emit("error", new Error("ECONNRESET"));
    publisher.emit("error", new Error("ECONNRESET"));
    publisher.emit("error", new Error("ECONNRESET"));

    const prefixed = errorSpy.mock.calls.filter((call) =>
      String(call[0]).includes("publisher error"),
    );
    expect(prefixed).toHaveLength(1);
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("logs a throwing message handler rather than swallowing it", async () => {
    const errorSpy = silent();
    const warnSpy = silentWarn();
    const { publisher, subscriber } = buildFanout(() => {
      throw new Error("handler exploded");
    });
    publisher.emit("ready");
    subscriber.emit("ready");

    subscriber.emit("message", "test:channel", "{}");

    await vi.waitFor(() => expect(errorSpy).toHaveBeenCalled());
    const logged = errorSpy.mock.calls.some((call) => String(call[0]).includes("handler threw"));
    expect(logged).toBe(true);
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
