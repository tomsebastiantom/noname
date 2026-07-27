import { onUnload } from "../core/lifecycle";
import { touchSession } from "../core/session";
import { Batcher, sendBeacon, sendWithRetry } from "../core/transport";
import type { AnalyticsEvent, AnalyticsModule, ObservabilityUser } from "../types";

function userMeta(user: ObservabilityUser | null): Record<string, unknown> {
  if (!user) return {};
  const meta: Record<string, unknown> = { userId: user.id };
  if (user.email) meta.userEmail = user.email;
  if (user.name) meta.userName = user.name;
  return meta;
}

interface AnalyticsContext {
  sessionId: string;
  schemaId: string | null;
  variantId: string | null;
  contextHash: string | null;
}

export function createAnalyticsModule(
  endpoint: string,
  getContext: () => AnalyticsContext,
  getHeaders: () => Record<string, string>,
  getUser: () => ObservabilityUser | null,
  batchSize = 50,
  flushIntervalMs = 5000,
): AnalyticsModule {
  const toPayload = (batch: AnalyticsEvent[]) =>
    batch.map((e) => ({
      eventType: e.eventType,
      sessionId: e.sessionId,
      schemaId: e.schemaId,
      variantId: e.variantId,
      contextHash: e.contextHash,
      meta: e.meta,
    }));

  const batcher = new Batcher<AnalyticsEvent>(
    async (batch) => {
      await sendWithRetry(endpoint, JSON.stringify(toPayload(batch)), 1, getHeaders());
    },
    { batchSize, flushIntervalMs },
  );

  onUnload(() => {
    const batch = batcher.drainForBeacon();
    if (batch.length > 0) {
      sendBeacon(endpoint, JSON.stringify(toPayload(batch)));
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
        meta: { ...meta, ...userMeta(getUser()) },
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
