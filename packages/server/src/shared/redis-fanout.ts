import Redis from "ioredis";
import { getRedisConnection } from "./redis";
import { registerRedisFanout } from "./redis-fanout-status";

/**
 * A Redis pub/sub connection pair for cross-replica fan-out (event bus, SSE, collab relay),
 * with two properties the three hand-rolled copies it replaces did not have.
 *
 * **Liveness reflects the connection, not the object.** Every one of those copies registered its
 * health as `() => publisher !== null`, and `publisher` is assigned once at startup and never
 * cleared. So `/health` reported the subsystem healthy forever after boot: if Redis died at 03:00,
 * diagnosis at 09:00 still said "sse: true, event-bus: true", while cross-replica delivery was
 * silently dead. Readiness here is driven by the connections' own `ready`/`error`/`close`/`end`
 * events, so it can actually go down — and come back.
 *
 * **Publishing cannot hang or crash the caller.** `getRedisConnection()` sets
 * `maxRetriesPerRequest: null`, which makes ioredis queue commands indefinitely while offline
 * rather than failing them. Awaiting such a publish from a request path can therefore block until
 * Redis returns. Worse, most call sites are `void eventBus.publish(...)`, and Node throws on
 * unhandled rejection — so a rejected publish would not be ignored, it would take the process down.
 * Publishing here is best-effort: bounded by a timeout, always resolved, failures logged.
 *
 * What this deliberately does **not** add is an outbox or replay. Fan-out remains at-most-once:
 * local delivery happens first and is already awaited by the caller, but a cross-replica message
 * lost while Redis is down is still lost. Durable delivery is an architectural change and belongs
 * with the enforcement work, not here.
 */

export const REDIS_FANOUT_PUBLISH_TIMEOUT_MS = 2_000;

/** The slice of an ioredis client this module needs, so tests can supply a fake. */
export type FanoutConnection = {
  subscribe(channel: string): Promise<unknown>;
  publish(channel: string, message: string): Promise<unknown>;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
};

export type RedisFanoutOptions = {
  /** Name reported in `/health` and the degraded heartbeat (e.g. `"event-bus"`). */
  name: string;
  /** Pub/sub channel carrying this subsystem's messages. */
  channel: string;
  /** What stops working while degraded — used verbatim in the log line. */
  consequence: string;
  /** Called with each raw message. Throwing here is caught and logged, never propagated. */
  onMessage: (raw: string) => void;
  /** Test seam. Defaults to a real ioredis client built from `getRedisConnection()`. */
  createConnection?: () => FanoutConnection;
};

export type RedisFanout = {
  /** Pair created, subscribed, and every connection reporting `ready`. */
  isActive(): boolean;
  /** Best-effort cross-replica publish. Never throws, never outlives the timeout. */
  publish(payload: unknown): Promise<void>;
};

/** A promise that rejects if `operation` has not settled within `ms`, without leaking a timer. */
function withTimeout(operation: Promise<unknown>, ms: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`publish timed out after ${ms}ms`));
    }, ms);
    // Do not let a pending fan-out publish hold the process open at shutdown.
    (timer as { unref?: () => void }).unref?.();
    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function createRedisFanout(options: RedisFanoutOptions): RedisFanout {
  const { name, channel, consequence, onMessage } = options;
  const createConnection =
    options.createConnection ??
    (() => new Redis(getRedisConnection()) as unknown as FanoutConnection);

  const connections = new Map<string, FanoutConnection>();
  const ready = new Set<string>();
  let active = false;

  function recompute(): void {
    const next = connections.size > 0 && ready.size === connections.size;
    if (next === active) return;
    active = next;
    if (next) {
      console.warn(`[redis-fanout:${name}] connections ready — cross-replica fan-out active`);
    } else {
      console.error(`[redis-fanout:${name}] connection not ready — degraded: ${consequence}`);
    }
  }

  function track(role: "publisher" | "subscriber", connection: FanoutConnection): void {
    connections.set(role, connection);
    connection.on("ready", () => {
      ready.add(role);
      recompute();
    });
    for (const event of ["error", "close", "end"] as const) {
      connection.on(event, (...args: unknown[]) => {
        // ioredis retries forever with backoff, emitting `error` on every failed attempt. Logging
        // each one turns a sustained outage into a flood — one ECONNRESET per connection per
        // subsystem every couple of seconds. Only the transition out of `ready` earns a line; the
        // repeat-while-degraded signal is already the periodic heartbeat in redis-fanout-status.
        const wasReady = ready.delete(role);
        if (event === "error" && wasReady) {
          console.error(`[redis-fanout:${name}] ${role} error: ${consequence}`, ...args);
        }
        recompute();
      });
    }
  }

  let publisher: FanoutConnection | null = null;

  try {
    const publisherConnection = createConnection();
    const subscriber = createConnection();
    track("publisher", publisherConnection);
    track("subscriber", subscriber);
    publisher = publisherConnection;

    void Promise.resolve(subscriber.subscribe(channel)).catch((error: unknown) => {
      console.error(`[redis-fanout:${name}] subscribe failed — degraded: ${consequence}`, error);
      ready.delete("subscriber");
      recompute();
    });

    subscriber.on("message", (_channel: unknown, raw: unknown) => {
      if (typeof raw !== "string") return;
      try {
        onMessage(raw);
      } catch (error) {
        // Previously the callers' own `catch {}` swallowed this too. A handler that throws
        // synchronously on every message is a bug that should be visible, not silent.
        console.error(`[redis-fanout:${name}] message handler threw`, error);
      }
    });
  } catch (error) {
    publisher = null;
    console.error(`[redis-fanout:${name}] Redis unavailable — degraded: ${consequence}`, error);
  }

  registerRedisFanout(name, () => active);

  return {
    isActive: () => active,
    publish: async (payload: unknown) => {
      if (!publisher) return;
      let message: string;
      try {
        message = JSON.stringify(payload);
      } catch (error) {
        console.error(`[redis-fanout:${name}] payload is not serialisable; not published`, error);
        return;
      }
      try {
        await withTimeout(publisher.publish(channel, message), REDIS_FANOUT_PUBLISH_TIMEOUT_MS);
      } catch (error) {
        // Local delivery already happened and is the contract; this is fan-out only. Log rather
        // than reject so a `void`-ed call cannot become an unhandled rejection.
        console.error(
          `[redis-fanout:${name}] publish failed — other replicas will miss this message: ${consequence}`,
          error,
        );
      }
    },
  };
}
