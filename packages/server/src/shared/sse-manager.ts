import type { SSEStreamingApi } from "hono/streaming";

type TenantId = string;
type StreamId = string;

const clients = new Map<TenantId, Map<StreamId, SSEStreamingApi>>();

export function addClient(tenantId: TenantId, stream: SSEStreamingApi): StreamId {
  if (!clients.has(tenantId)) {
    clients.set(tenantId, new Map());
  }
  const tenantClients = clients.get(tenantId)!;
  const streamId = crypto.randomUUID();
  tenantClients.set(streamId, stream);

  stream.onAbort(() => {
    tenantClients.delete(streamId);
    if (tenantClients.size === 0) {
      clients.delete(tenantId);
    }
  });

  return streamId;
}

export function removeClient(tenantId: TenantId, streamId: StreamId): void {
  const tenantClients = clients.get(tenantId);
  if (tenantClients) {
    tenantClients.delete(streamId);
    if (tenantClients.size === 0) {
      clients.delete(tenantId);
    }
  }
}

export function broadcast(tenantId: TenantId, data: Record<string, unknown>): void {
  const tenantClients = clients.get(tenantId);
  if (!tenantClients) return;

  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const stream of tenantClients.values()) {
    try {
      stream.write(payload);
    } catch {
      // Stream closed — cleanup handled by onAbort
    }
  }
}

export function getClientCount(tenantId?: TenantId): number {
  if (tenantId) {
    return clients.get(tenantId)?.size ?? 0;
  }
  let total = 0;
  for (const m of clients.values()) total += m.size;
  return total;
}
