import type { SSEStreamingApi } from "hono/streaming";

type OrgId = string;
type StreamId = string;

const clients = new Map<OrgId, Map<StreamId, SSEStreamingApi>>();

export function addClient(orgId: OrgId, stream: SSEStreamingApi): StreamId {
  if (!clients.has(orgId)) {
    clients.set(orgId, new Map());
  }
  const orgClients = clients.get(orgId)!;
  const streamId = crypto.randomUUID();
  orgClients.set(streamId, stream);

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
  const orgClients = clients.get(orgId);
  if (!orgClients) return;

  for (const stream of orgClients.values()) {
    try {
      stream.writeSSE({ data: JSON.stringify(data) });
    } catch {
      // Stream closed — cleanup handled by onAbort
    }
  }
}

export function getClientCount(orgId?: OrgId): number {
  if (orgId) {
    return clients.get(orgId)?.size ?? 0;
  }
  let total = 0;
  for (const m of clients.values()) total += m.size;
  return total;
}
