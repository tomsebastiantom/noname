import type { Queue } from "bullmq";
import type { AnalyticsService, AnalyticsStorage } from "./ports";
import type { AnalyticsJobData } from "./queue";

const AUDIT_EVENTS = new Set(["machine.transition", "task.failed"]);

export function createAnalyticsService(
  storage: AnalyticsStorage,
  queue: Queue<AnalyticsJobData>,
): AnalyticsService {
  return {
    async track(tenantId, input) {
      const eventId = crypto.randomUUID();
      const event: AnalyticsJobData = {
        eventId,
        tenantId,
        eventType: input.eventType,
        eventSource: "frontend",
        timestamp: new Date(),
        sessionId: input.sessionId,
        schemaId: input.schemaId ?? null,
        variantId: input.variantId ?? null,
        contextHash: input.contextHash ?? null,
        meta: input.meta ?? {},
      };
      await queue.add("ingest", event);
      return { eventId, accepted: true };
    },

    async ingestServerEvent(eventType, data) {
      const tenantId = (data as any).tenantId || "";
      if (!tenantId) return;

      const event: AnalyticsJobData = {
        eventId: crypto.randomUUID(),
        tenantId,
        eventType,
        eventSource: "server",
        timestamp: new Date(),
        sessionId: "",
        schemaId: (data as any).schemaId ?? null,
        variantId: (data as any).variantId ?? null,
        contextHash: (data as any).contextHash ?? (data as any).hash ?? null,
        meta: data,
      };

      if (AUDIT_EVENTS.has(eventType)) {
        await storage.ingest(event);
      } else {
        await queue.add("ingest", event);
      }
    },

    async query(filters) {
      return storage.query(filters);
    },

    async aggregate(filters) {
      return storage.aggregate(filters);
    },

    async conversionRates(filters) {
      return storage.conversionRates(filters);
    },

    async segmentEvents(filters) {
      return storage.segmentEvents(filters);
    },
  };
}
