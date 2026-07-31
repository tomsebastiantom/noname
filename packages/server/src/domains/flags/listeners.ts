import { eventBus } from "../../shared/event-bus";
import { broadcast } from "../../shared/sse-manager";
import { FlagEvents } from "./events";

function broadcastFlagChange(data: unknown): void {
  const payload = data as { orgId?: string; key?: string };
  if (payload?.orgId && payload?.key) {
    broadcast(payload.orgId, { key: payload.key });
  }
}

/** SSE: broadcast flag changes to connected admin clients. */
export function registerFlagListeners(): void {
  for (const event of [FlagEvents.CREATED, FlagEvents.UPDATED, FlagEvents.DELETED] as const) {
    eventBus.subscribe(event, async (data) => {
      broadcastFlagChange(data);
    });
  }
}
