import { eventBus } from "../../shared/event-bus";

/** Fire-and-forget domain event from documents services without an aggregate entity. */
export function emitDocumentEvent(event: string, payload: Record<string, unknown>): void {
  void eventBus.publish(event, payload);
}
