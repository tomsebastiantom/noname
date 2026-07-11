export interface ContextSignal {
  category: "user" | "device" | "network" | "geography" | "business" | "referral" | "time";
  key: string;
  value: string;
}

export interface SegmentDTO {
  id: string;
  tenantId: string;
  hash: string;
  signals: ContextSignal[];
  createdAt: Date;
}

// Persistence for segments + visitor->segment cache.
// Kept separate from the engine so the engine stays pure (hashing + orchestration).
export interface ContextStorage {
  saveSegment(tenantId: string, hash: string, signals: ContextSignal[]): Promise<SegmentDTO>;
  findSegmentByHash(tenantId: string, hash: string): Promise<SegmentDTO | null>;
  cacheSegment(tenantId: string, visitorId: string, segmentHash: string): Promise<void>;
  findCachedSegment(tenantId: string, visitorId: string): Promise<string | null>;
  listSegments(tenantId: string): Promise<SegmentDTO[]>;
}

export interface ContextEngine {
  // Resolve a signal set to a deterministic segment. tenantId is optional for
  // ad-hoc resolution; request-based resolution always carries one.
  resolve(signals: ContextSignal[], tenantId?: string): Promise<SegmentDTO>;
  // Extract signals from request headers, resolve (using cache when possible),
  // persist the segment, and publish context.segment_resolved.
  segmentForRequest(tenantId: string, headers: Record<string, string>): Promise<SegmentDTO>;
  listSegments(tenantId: string): Promise<SegmentDTO[]>;
}
