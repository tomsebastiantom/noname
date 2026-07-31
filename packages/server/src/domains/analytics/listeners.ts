import { ALL_DOMAIN_EVENTS } from "../../domain-events";
import { eventBus } from "../../shared/event-bus";
import type { AnalyticsService } from "./ports";

export function registerAnalyticsListeners(service: AnalyticsService): void {
  for (const eventName of ALL_DOMAIN_EVENTS) {
    eventBus.subscribe(eventName, (payload) =>
      service.ingestServerEvent(eventName, payload as Record<string, unknown>),
    );
  }
}
