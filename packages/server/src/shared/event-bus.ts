import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import type { DomainEventName } from "../domain-events";
import { getRedisConnection } from "./redis";
import { registerRedisFanout } from "./redis-fanout-status";

const CHANNEL = "noname:event-bus";
const INSTANCE_ID = randomUUID();

type EventHandler = (payload: unknown) => Promise<void>;
type PublishedMessage = { event: string; payload: unknown; origin?: string };

const handlers = new Map<string, EventHandler[]>();
let publisher: Redis | null = null;
let initialized = false;

async function dispatchLocal(event: string, payload: unknown): Promise<void> {
  for (const h of handlers.get(event) || []) {
    try {
      await h(payload);
    } catch {
      /* fire-and-forget */
    }
  }
}

/** Subscribe to Redis pub/sub so events reach every API replica. No-op without Redis. */
export function initEventBus(): void {
  if (initialized) return;
  initialized = true;
  registerRedisFanout("event-bus", () => publisher !== null);

  try {
    publisher = new Redis(getRedisConnection());
    const subscriber = new Redis(getRedisConnection());
    void subscriber.subscribe(CHANNEL);
    subscriber.on("message", (_channel, raw) => {
      try {
        const msg = JSON.parse(raw) as PublishedMessage;
        if (msg.origin === INSTANCE_ID) return;
        if (typeof msg.event === "string") {
          void dispatchLocal(msg.event, msg.payload);
        }
      } catch {
        /* ignore malformed */
      }
    });
  } catch (err) {
    publisher = null;
    console.error(
      "[event-bus] Redis unavailable — degraded to single-instance mode (events won't reach other replicas)",
      err,
    );
  }
}

export const eventBus = {
  publish: async (event: DomainEventName | string, payload: unknown) => {
    // Always deliver locally first. Redis is cross-replica fan-out, not the local delivery path.
    await dispatchLocal(event, payload);
    if (publisher) {
      await publisher.publish(CHANNEL, JSON.stringify({ event, payload, origin: INSTANCE_ID }));
    }
  },

  subscribe: (event: DomainEventName | string, handler: EventHandler) => {
    const existing = handlers.get(event) || [];
    existing.push(handler);
    handlers.set(event, existing);
  },
};
