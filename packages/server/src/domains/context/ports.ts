export interface ContextSignal {
  category: "user" | "device" | "network" | "geography" | "business" | "referral" | "time";
  key: string;
  value: string;
}

export interface SegmentDTO {
  id: string;
  orgId: string;
  hash: string;
  signals: ContextSignal[];
  createdAt: Date;
}

// Persistence for segments + visitor->segment cache.
// Kept separate from the service so resolution stays pure (hashing + orchestration).
export interface ContextStorage {
  saveSegment(orgId: string, hash: string, signals: ContextSignal[]): Promise<SegmentDTO>;
  findSegmentByHash(orgId: string, hash: string): Promise<SegmentDTO | null>;
  cacheSegment(orgId: string, visitorId: string, segmentHash: string): Promise<void>;
  findCachedSegment(orgId: string, visitorId: string): Promise<string | null>;
  listSegments(orgId: string): Promise<SegmentDTO[]>;
}

export interface ContextService {
  // Resolve a signal set to a deterministic segment. orgId is optional for
  // ad-hoc resolution; request-based resolution always carries one.
  resolve(signals: ContextSignal[], orgId?: string): Promise<SegmentDTO>;
  // Extract signals from request headers, resolve (using cache when possible),
  // persist the segment, and publish context.segment_resolved.
  segmentForRequest(orgId: string, headers: Record<string, string>): Promise<SegmentDTO>;
  listSegments(orgId: string): Promise<SegmentDTO[]>;
}

export interface ContextEngine {
  resolve(signals: ContextSignal[], tenantId?: string): Promise<SegmentDTO>;
  segmentForRequest(tenantId: string, headers: Record<string, string>): Promise<SegmentDTO>;
  listSegments(tenantId: string): Promise<SegmentDTO[]>;
}
