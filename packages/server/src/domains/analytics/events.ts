import { eventBus } from "../../shared/event-bus";
export function registerAnalyticsListeners() {
  eventBus.subscribe("content.created", async (p) => { console.log("analytics: content.created", p); });
  eventBus.subscribe("layout.published", async (p) => { console.log("analytics: layout.published", p); });
}
