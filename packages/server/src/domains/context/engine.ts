import { createHash } from "node:crypto";
import { eventBus } from "../../shared/event-bus";
import type { ContextEngine, ContextSignal, ContextStorage, SegmentDTO } from "./ports";
import { extractSignals } from "./signal-extraction";

// Deterministic, tenant-agnostic segment resolution.
// The SAME signal set ALWAYS maps to the SAME hash — regardless of which
// tenant or when — so personalization is stable and cacheable.
export function createContextEngine(storage: ContextStorage): ContextEngine {
  const hashSignals = (signals: ContextSignal[]): string => {
    const sorted = [...signals].sort((a, b) =>
      a.category === b.category ? a.key.localeCompare(b.key) : a.category.localeCompare(b.category),
    );
    const serialized = sorted.map((s) => `${s.category}:${s.key}:${s.value}`).join("|");
    return createHash("sha256").update(serialized).digest("hex").slice(0, 16);
  };

  return {
    async resolve(signals: ContextSignal[], orgId = ""): Promise<SegmentDTO> {
      const hash = hashSignals(signals);
      return (
        (await storage.findSegmentByHash(orgId, hash)) ?? storage.saveSegment(orgId, hash, signals)
      );
    },

    async segmentForRequest(orgId: string, headers: Record<string, string>): Promise<SegmentDTO> {
      const signals = extractSignals(headers);
      const hash = hashSignals(signals);
      const visitorId = headers["x-visitor-id"] || headers["visitor-id"] || "";

      const cachedHash = visitorId ? await storage.findCachedSegment(orgId, visitorId) : null;
      const segment =
        (cachedHash ? await storage.findSegmentByHash(orgId, cachedHash) : null) ??
        (await storage.findSegmentByHash(orgId, hash)) ??
        (await storage.saveSegment(orgId, hash, signals));

      if (visitorId) await storage.cacheSegment(orgId, visitorId, segment.hash);

      eventBus.publish("context.segment_resolved", { orgId, hash: segment.hash, signals });
      return segment;
    },

    listSegments(orgId: string): Promise<SegmentDTO[]> {
      return storage.listSegments(orgId);
    },
  };
}
