import { randomUUID } from "node:crypto";
import type { DomainEventName } from "../domain-events";
import { createRedisFanout, type RedisFanout } from "./redis-fanout";

const CHANNEL = "noname:event-bus";
const INSTANCE_ID = randomUUID();

type EventHandler = (payload: unknown) => Promise<void>;
type PublishedMessage = { event: string; payload: unknown; origin?: string };

const handlers = new Map<string, EventHandler[]>();
let fanout: RedisFanout | null = null;
let initialized = false;

async function dispatchLocal(event: string, payload: unknown): Promise<void> {
  for (const h of handlers.get(event) || []) {
    try {
      await h(payload);
    } catch (error) {
      // This used to be `catch { /* fire-and-forget */ }` — a subscriber could fail on every
      // single event with no log, no counter, and no health signal anywhere. Failures are still
      // non-fatal (the remaining subscribers must run), but they are no longer invisible.
      console.error(
        `[event-bus] subscriber for "${event}" threw; other subscribers were still notified`,
        error,
      );
    }
  }
}

/** Subscribe to Redis pub/sub so events reach every API replica. No-op without Redis. */
export function initEventBus(): void {
  if (initialized) return;
  initialized = true;

  fanout = createRedisFanout({
    name: "event-bus",
    channel: CHANNEL,
    consequence: "events won't reach other API replicas",
    onMessage: (raw) => {
      let msg: PublishedMessage;
      try {
        msg = JSON.parse(raw) as PublishedMessage;
      } catch {
        return; // not a message of ours; nothing to do
      }
      if (msg.origin === INSTANCE_ID) return;
      if (typeof msg.event === "string") {
        void dispatchLocal(msg.event, msg.payload);
      }
    },
  });
}

export const eventBus = {
  publish: async (event: DomainEventName | string, payload: unknown) => {
    // Always deliver locally first. Redis is cross-replica fan-out, not the local delivery path.
    await dispatchLocal(event, payload);
    await fanout?.publish({ event, payload, origin: INSTANCE_ID });
  },

  subscribe: (event: DomainEventName | string, handler: EventHandler) => {
    const existing = handlers.get(event) || [];
    existing.push(handler);
    handlers.set(event, existing);
  },
};
