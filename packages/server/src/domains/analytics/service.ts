import type { Queue } from "bullmq";
import type { AnalyticsService, AnalyticsStorage } from "./ports";
import type { AnalyticsJobData } from "./queue";

const AUDIT_EVENTS = new Set(["machine.transition", "task.failed"]);

export function createAnalyticsService(
  storage: AnalyticsStorage,
  queue: Queue<AnalyticsJobData>,
): AnalyticsService {
  return {
    async track(orgId, input) {
      const eventId = crypto.randomUUID();
      const event: AnalyticsJobData = {
        eventId,
        orgId,
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

    async trackBatch(orgId, inputs) {
      const results: Array<{ eventId: string; accepted: boolean }> = [];
      for (const input of inputs) {
        results.push(await this.track(orgId, input));
      }
      return results;
    },

    async ingestServerEvent(eventType, data) {
      const orgId = (data as any).orgId || "";
      if (!orgId) return;

      const event: AnalyticsJobData = {
        eventId: crypto.randomUUID(),
        orgId,
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
