import type { SSEStreamingApi } from "hono/streaming";
import { createRedisFanout, type RedisFanout } from "./redis-fanout";

const CHANNEL = "noname:sse";

type StreamId = string;
type Topic = string;

/**
 * SSE delivery is **topic-addressed**, following the model every mature implementation uses:
 * Socket.IO rooms (`socket.join(userId)` → `io.to(userId).emit(...)`) and Mercure, whose spec separates
 * routing from authorization — "the query parameters never grant access to private updates", and a
 * private update "MUST NOT" be dispatched to a subscriber not authorized to receive it.
 *
 * The recipient is a property of the *subscription*, resolved server-side at connect time, rather than a
 * predicate evaluated against the payload at delivery time. That distinction is the whole fix: the
 * previous design broadcast per-org and filtered on a `userId` inside the payload, so an anonymous
 * storefront connection (ticket carries an empty userId) was a legitimate candidate for another user's
 * inbox notification, with only a runtime check standing between them.
 *
 * Topics are derived from the authenticated stream ticket, never chosen by the client — that is what
 * makes the subscription itself the authorization.
 */

/** Admin/storefront flag changes for one org. Anonymous: the ticket carries an empty userId. */
export function flagsTopic(orgId: string): Topic {
  return `org:${orgId}/flags`;
}

/** One user's notifications within one org. Org-scoped so ids cannot collide across tenants. */
export function userTopic(orgId: string, userId: string): Topic {
  return `org:${orgId}/user:${userId}`;
}

type FanoutMessage = { topic?: Topic; data?: Record<string, unknown> };

/** topic → streamId → stream. Delivery is one map lookup; no scanning, no filtering. */
const subscribers = new Map<Topic, Map<StreamId, SSEStreamingApi>>();
let fanout: RedisFanout | null = null;
let initialized = false;

function deliverLocal(topic: Topic, data: Record<string, unknown>): void {
  const streams = subscribers.get(topic);
  if (!streams) return;
  const payload = JSON.stringify(data);
  for (const stream of streams.values()) {
    try {
      stream.writeSSE({ data: payload });
    } catch {
      // Stream closed — cleanup handled by onAbort
    }
  }
}

function deliver(message: FanoutMessage): void {
  if (typeof message.topic !== "string" || !message.data || typeof message.data !== "object")
    return;
  deliverLocal(message.topic, message.data);
}

/** Subscribe to Redis pub/sub so SSE reaches clients on every API replica. */
export function initSseManager(): void {
  if (initialized) return;
  initialized = true;

  fanout = createRedisFanout({
    name: "sse",
    channel: CHANNEL,
    consequence: "SSE won't reach clients connected to other API replicas",
    onMessage: (raw) => {
      let msg: FanoutMessage;
      try {
        msg = JSON.parse(raw) as FanoutMessage;
      } catch {
        return; // not a message of ours; nothing to do
      }
      // Fails closed by design. A message without a topic cannot be routed, and the alternatives are
      // both worse: broadcasting it would deliver a per-user notification to every subscriber (exactly
      // the leak this replaces), while dropping it costs at most one event during a mixed-version
      // rollout.
      deliver(msg);
    },
  });
}

/** Subscribe one connection to one topic. Only the route may decide the topic — never the client. */
export function subscribe(topic: Topic, stream: SSEStreamingApi): StreamId {
  let streams = subscribers.get(topic);
  if (!streams) {
    streams = new Map();
    subscribers.set(topic, streams);
  }
  const streamId = crypto.randomUUID();
  streams.set(streamId, stream);

  stream.onAbort(() => {
    unsubscribe(topic, streamId);
  });

  return streamId;
}

export function unsubscribe(topic: Topic, streamId: StreamId): void {
  const streams = subscribers.get(topic);
  if (!streams) return;
  streams.delete(streamId);
  if (streams.size === 0) subscribers.delete(topic);
}

export function broadcast(topic: Topic, data: Record<string, unknown>): void {
  // Unchanged semantics: while fan-out is live, the message goes to Redis and every replica —
  // this one included — receives it through its own subscription, so broadcasting locally as well
  // would double-deliver. Only when fan-out is down do we deliver directly to local clients.
  if (fanout?.isActive()) {
    void fanout.publish({ topic, data });
    return;
  }
  deliverLocal(topic, data);
}

/** Connected streams, optionally narrowed to one topic. */
export function getClientCount(topic?: Topic): number {
  if (topic) return subscribers.get(topic)?.size ?? 0;
  let total = 0;
  for (const streams of subscribers.values()) total += streams.size;
  return total;
}
