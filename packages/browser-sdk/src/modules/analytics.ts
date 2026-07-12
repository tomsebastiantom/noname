import { onUnload } from "../core/lifecycle";
import { touchSession } from "../core/session";
import { Batcher, sendBeacon, sendWithRetry } from "../core/transport";
import type { AnalyticsEvent, AnalyticsModule } from "../types";

interface AnalyticsContext {
  sessionId: string;
  schemaId: string | null;
  variantId: string | null;
  contextHash: string | null;
}

export function createAnalyticsModule(
  endpoint: string,
  getContext: () => AnalyticsContext,
  batchSize = 50,
  flushIntervalMs = 5000,
): AnalyticsModule {
  const batcher = new Batcher<AnalyticsEvent>(
    async (batch) => {
      const body = JSON.stringify(
        batch.map((e) => ({
          eventType: e.eventType,
          sessionId: e.sessionId,
          schemaId: e.schemaId,
          variantId: e.variantId,
          contextHash: e.contextHash,
          meta: e.meta,
        })),
      );
      await sendWithRetry(endpoint, body, 1);
    },
    { batchSize, flushIntervalMs },
  );

  onUnload(() => {
    const batch = batcher.drainForBeacon();
    if (batch.length > 0) {
      sendBeacon(
        endpoint,
        JSON.stringify(
          batch.map((e) => ({
            eventType: e.eventType,
            sessionId: e.sessionId,
            schemaId: e.schemaId,
            variantId: e.variantId,
            contextHash: e.contextHash,
            meta: e.meta,
          })),
        ),
      );
    }
  });

  const mod: AnalyticsModule = {
    track(eventType, meta = {}) {
      const ctx = getContext();
      touchSession({ id: ctx.sessionId, startedAt: 0, lastActivity: Date.now() });
      batcher.push({
        eventType,
        sessionId: ctx.sessionId,
        schemaId: ctx.schemaId,
        variantId: ctx.variantId,
        contextHash: ctx.contextHash,
        meta,
        timestamp: Date.now(),
      });
    },

    pageView() {
      mod.track("page_view", {
        url: typeof window !== "undefined" ? window.location.href : "",
      });
    },

    identify(_sessionId) {
      // Override handled externally via getContext
    },

    setContext(_sId, _vId, _cHash) {
      // Override handled externally via getContext
    },

    flush() {
      return batcher.flush();
    },
  };

  return mod;
}
