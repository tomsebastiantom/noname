import type { SSEStreamingApi } from "hono/streaming";
import Redis from "ioredis";
import { getRedisConnection } from "./redis";
import { registerRedisFanout } from "./redis-fanout-status";

const CHANNEL = "noname:sse";

type OrgId = string;
type StreamId = string;
type UserId = string;

type ClientEntry = {
  stream: SSEStreamingApi;
  userId?: UserId;
};

const clients = new Map<OrgId, Map<StreamId, ClientEntry>>();
let publisher: Redis | null = null;
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
  registerRedisFanout("sse", () => publisher !== null);

  try {
    publisher = new Redis(getRedisConnection());
    const subscriber = new Redis(getRedisConnection());
    void subscriber.subscribe(CHANNEL);
    subscriber.on("message", (_channel, raw) => {
      try {
        const msg = JSON.parse(raw) as { orgId?: string; data?: Record<string, unknown> };
        if (typeof msg.orgId === "string" && msg.data && typeof msg.data === "object") {
          broadcastLocal(msg.orgId, msg.data);
        }
      } catch {
        /* ignore malformed */
      }
    });
  } catch (err) {
    publisher = null;
    console.error(
      "[sse-manager] Redis unavailable — degraded to single-instance mode (SSE won't reach clients on other replicas)",
      err,
    );
  }
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
  if (publisher) {
    void publisher.publish(CHANNEL, JSON.stringify({ orgId, data }));
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
