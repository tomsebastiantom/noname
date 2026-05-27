import { eventBus } from "../../shared/event-bus";
export function registerAnalyticsListeners() {
  eventBus.subscribe("content.created", async (p) => { console.log("analytics: content.created", p); });
  eventBus.subscribe("spec.published", async (p) => { console.log("analytics: spec.published", p); });
}
