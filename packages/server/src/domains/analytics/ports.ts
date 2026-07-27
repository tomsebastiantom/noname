export type AnalyticsEventSource = "server" | "frontend";

export interface AnalyticsEventDTO {
  eventId: string;
  orgId: string;
  eventType: string;
  eventSource: AnalyticsEventSource;
  timestamp: Date;
  sessionId: string;
  schemaId: string | null;
  variantId: string | null;
  contextHash: string | null;
  meta: Record<string, unknown>;
}

export interface TrackEventInput {
  eventType: string;
  sessionId: string;
  schemaId?: string | null;
  variantId?: string | null;
  contextHash?: string | null;
  meta?: Record<string, unknown>;
}

export interface EventQueryFilters {
  orgId?: string;
  eventType?: string;
  eventSource?: AnalyticsEventSource;
  from?: Date;
  to?: Date;
  sessionId?: string;
  schemaId?: string;
  variantId?: string;
  contextHash?: string;
  limit?: number;
  offset?: number;
}

export interface AggregationFilters {
  orgId: string;
  groupBy?: "eventType" | "sessionId" | "schemaId" | "contextHash";
  from?: Date;
  to?: Date;
  limit?: number;
}

export interface AggregationResult {
  key: string;
  count: number;
}

export interface ConversionFilters {
  orgId: string;
  schemaId?: string;
  variantId?: string;
  from?: Date;
  to?: Date;
}

export interface ConversionResult {
  variantId: string | null;
  impressions: number;
  conversions: number;
  rate: number;
}

export interface AnalyticsStorage {
  ingest(event: AnalyticsEventDTO): Promise<void>;
  ingestBatch(events: AnalyticsEventDTO[]): Promise<void>;
  query(filters: EventQueryFilters): Promise<AnalyticsEventDTO[]>;
  aggregate(filters: AggregationFilters): Promise<AggregationResult[]>;
  conversionRates(filters: ConversionFilters): Promise<ConversionResult[]>;
  segmentEvents(filters: SegmentEventsInput): Promise<SegmentEventsResult>;
}

export interface SegmentEventsInput {
  orgId: string;
  signalCategories?: string[];
  from?: Date;
  to?: Date;
  limit?: number;
}

export interface SegmentCluster {
  eventType: string;
  contextHash: string | null;
  count: number;
  avgMeta: Record<string, number>;
}

export interface SegmentEventsResult {
  clusters: SegmentCluster[];
  totalEvents: number;
}

export interface AnalyticsService {
  track(orgId: string, input: TrackEventInput): Promise<{ eventId: string; accepted: boolean }>;
  trackBatch(
    orgId: string,
    inputs: TrackEventInput[],
  ): Promise<Array<{ eventId: string; accepted: boolean }>>;
  ingestServerEvent(eventType: string, data: Record<string, unknown>): Promise<void>;
  query(filters: EventQueryFilters): Promise<AnalyticsEventDTO[]>;
  aggregate(filters: AggregationFilters): Promise<AggregationResult[]>;
  conversionRates(filters: ConversionFilters): Promise<ConversionResult[]>;
  segmentEvents(filters: SegmentEventsInput): Promise<SegmentEventsResult>;
}
