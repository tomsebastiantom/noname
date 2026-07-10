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

export interface ContextEngine {
  resolve(signals: ContextSignal[]): Promise<SegmentDTO>;
  segmentForRequest(tenantId: string, headers: Record<string, string>): Promise<SegmentDTO>;
}