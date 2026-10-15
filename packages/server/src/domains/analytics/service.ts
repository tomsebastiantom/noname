import type { Queue } from "bullmq";
import type { AnalyticsEventDTO, AnalyticsService, AnalyticsStorage } from "./ports";
import { type AnalyticsJobData, analyticsIngestBatchSize, chunkAnalyticsEvents } from "./queue";

const AUDIT_EVENTS = new Set(["machine.transition", "task.failed"]);

function stringDimension(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function versionDimension(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function serverSessionId(value: unknown): string {
  const sessionId = stringDimension(value);
  return sessionId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)
    ? sessionId
    : "";
}

function serverAttributionDimensions(data: Record<string, unknown>) {
  return {
    audienceKey: stringDimension(data.audienceKey),
    audienceDefinitionVersion: versionDimension(data.audienceDefinitionVersion),
    bindingId: stringDimension(data.bindingId),
    bindingVersion: versionDimension(data.bindingVersion),
    decisionId: stringDimension(data.decisionId),
    pageKey: stringDimension(data.pageKey),
    locale: stringDimension(data.locale),
  };
}

export function createAnalyticsService(
  storage: AnalyticsStorage,
  queue: Queue<AnalyticsJobData>,
): AnalyticsService {
  type TrackInput = Parameters<AnalyticsService["track"]>[1];

  function buildFrontendEvent(orgId: string, input: TrackInput): AnalyticsEventDTO {
    return {
      eventId: crypto.randomUUID(),
      orgId,
      eventType: input.eventType,
      eventSource: "frontend",
      timestamp: new Date(),
      sessionId: input.sessionId,
      schemaId: input.schemaId ?? null,
      variantId: input.variantId ?? null,
      audienceKey: null,
      audienceDefinitionVersion: null,
      bindingId: null,
      bindingVersion: null,
      decisionId: null,
      pageKey: null,
      locale: null,
      meta: input.meta ?? {},
    };
  }

  return {
    async track(orgId, input) {
      const event = buildFrontendEvent(orgId, input);
      await queue.add("ingest", { events: [event] });
      return { eventId: event.eventId, accepted: true };
    },

    async trackBatch(orgId, inputs) {
      const events = inputs.map((input) => buildFrontendEvent(orgId, input));
      // Chunk into batched jobs: one Redis round trip and one ClickHouse INSERT per chunk, instead
      // of one of each per event. The job payload is the batch, so nothing is held in process
      // memory between accepting the request and the write landing.
      const chunks = chunkAnalyticsEvents(events, analyticsIngestBatchSize());
      if (chunks.length > 0) {
        await queue.addBulk(chunks.map((chunk) => ({ name: "ingest", data: { events: chunk } })));
      }
      return events.map((event) => ({ eventId: event.eventId, accepted: true }));
    },

    async ingestServerEvent(eventType, data) {
      const orgId = (data as any).orgId || "";
      if (!orgId) return;

      const event: AnalyticsEventDTO = {
        eventId: crypto.randomUUID(),
        orgId,
        eventType,
        eventSource: "server",
        timestamp: new Date(),
        sessionId: serverSessionId(data.sessionId),
        schemaId: stringDimension(data.schemaId),
        variantId: stringDimension(data.variantId),
        ...serverAttributionDimensions(data),
        meta: data,
      };

      if (AUDIT_EVENTS.has(eventType)) {
        await storage.ingest(event);
      } else {
        await queue.add("ingest", { events: [event] });
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

    async listReplaySessionIdsForUser(orgId, filter) {
      return storage.listReplaySessionIdsForUser(orgId, filter);
    },

    async loadReplaySessionIdentities(orgId, sessionIds) {
      return storage.loadReplaySessionIdentities(orgId, sessionIds);
    },
  };
}
