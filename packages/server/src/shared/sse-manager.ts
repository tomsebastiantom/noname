import type { SSEStreamingApi } from "hono/streaming";
import { createRedisFanout, type RedisFanout } from "./redis-fanout";

const CHANNEL = "noname:sse";

type OrgId = string;
type StreamId = string;
type UserId = string;

type ClientEntry = {
  stream: SSEStreamingApi;
  userId?: UserId;
};

const clients = new Map<OrgId, Map<StreamId, ClientEntry>>();
let fanout: RedisFanout | null = null;
let initialized = false;

function broadcastLocal(orgId: OrgId, data: Record<string, unknown>): void {
  const orgClients = clients.get(orgId);
  if (!orgClients) return;

  const targetUserId = typeof data.userId === "string" ? data.userId : null;

  for (const entry of orgClients.values()) {
    if (targetUserId && entry.userId && entry.userId !== targetUserId) {
      continue;
    }
    try {
      entry.stream.writeSSE({ data: JSON.stringify(data) });
    } catch {
      // Stream closed — cleanup handled by onAbort
    }
  }
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
      let msg: { orgId?: string; data?: Record<string, unknown> };
      try {
        msg = JSON.parse(raw) as { orgId?: string; data?: Record<string, unknown> };
      } catch {
        return; // not a message of ours; nothing to do
      }
      if (typeof msg.orgId === "string" && msg.data && typeof msg.data === "object") {
        broadcastLocal(msg.orgId, msg.data);
      }
    },
  });
}

export function addClient(orgId: OrgId, stream: SSEStreamingApi, userId?: UserId): StreamId {
  if (!clients.has(orgId)) {
    clients.set(orgId, new Map());
  }
  const orgClients = clients.get(orgId)!;
  const streamId = crypto.randomUUID();
  orgClients.set(streamId, { stream, userId });

  stream.onAbort(() => {
    orgClients.delete(streamId);
    if (orgClients.size === 0) {
      clients.delete(orgId);
    }
  });

  return streamId;
}

export function removeClient(orgId: OrgId, streamId: StreamId): void {
  const orgClients = clients.get(orgId);
  if (orgClients) {
    orgClients.delete(streamId);
    if (orgClients.size === 0) {
      clients.delete(orgId);
    }
  }
}

export function broadcast(orgId: OrgId, data: Record<string, unknown>): void {
  // Unchanged semantics: while fan-out is live, the message goes to Redis and every replica —
  // this one included — receives it through its own subscription, so broadcasting locally as well
  // would double-deliver. Only when fan-out is down do we deliver directly to local clients.
  //
  // The condition is now `isActive()` rather than "a publisher object exists". Previously a Redis
  // outage left SSE messages queued on the publish side with no local fallback at all: they reached
  // neither remote nor local clients until Redis returned.
  if (fanout?.isActive()) {
    void fanout.publish({ orgId, data });
    return;
  }
  broadcastLocal(orgId, data);
}

export function getClientCount(orgId?: OrgId): number {
  if (orgId) {
    return clients.get(orgId)?.size ?? 0;
  }
  let total = 0;
  for (const m of clients.values()) total += m.size;
  return total;
}
