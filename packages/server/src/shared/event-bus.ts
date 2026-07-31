import Redis from "ioredis";
import type { DomainEventName } from "../domain-events";
import { getRedisConnection } from "./redis";

const CHANNEL = "noname:event-bus";

type EventHandler = (payload: unknown) => Promise<void>;

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

  try {
    publisher = new Redis(getRedisConnection());
    const subscriber = new Redis(getRedisConnection());
    void subscriber.subscribe(CHANNEL);
    subscriber.on("message", (_channel, raw) => {
      try {
        const msg = JSON.parse(raw) as { event?: string; payload?: unknown };
        if (typeof msg.event === "string") {
          void dispatchLocal(msg.event, msg.payload);
        }
      } catch {
        /* ignore malformed */
      }
    });
  } catch {
    publisher = null;
  }
}

export const eventBus = {
  publish: async (event: DomainEventName | string, payload: unknown) => {
    if (publisher) {
      await publisher.publish(CHANNEL, JSON.stringify({ event, payload }));
      return;
    }
    await dispatchLocal(event, payload);
  },

  subscribe: (event: DomainEventName | string, handler: EventHandler) => {
    const existing = handlers.get(event) || [];
    existing.push(handler);
    handlers.set(event, existing);
  },
};
