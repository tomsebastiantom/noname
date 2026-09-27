export type AnalyticsEventSource = "server" | "frontend";

/** Server-owned attribution dimensions carried by experience decisions and trusted events. */
export interface ExperienceAttributionDimensions {
  audienceKey: string | null;
  audienceDefinitionVersion: number | null;
  bindingId: string | null;
  bindingVersion: number | null;
  decisionId: string | null;
  pageKey: string | null;
  locale: string | null;
}

export interface AnalyticsEventDTO extends ExperienceAttributionDimensions {
  eventId: string;
  orgId: string;
  eventType: string;
  eventSource: AnalyticsEventSource;
  timestamp: Date;
  sessionId: string;
  schemaId: string | null;
  variantId: string | null;
  meta: Record<string, unknown>;
}

/** Dimensions can be typed at the service boundary, but frontend ingest never trusts them. */
export interface TrackEventInput extends Partial<ExperienceAttributionDimensions> {
  eventType: string;
  sessionId: string;
  schemaId?: string | null;
  variantId?: string | null;
  meta?: Record<string, unknown>;
}

export interface EventQueryFilters extends Partial<ExperienceAttributionDimensions> {
  orgId?: string;
  eventType?: string;
  eventSource?: AnalyticsEventSource;
  from?: Date;
  to?: Date;
  sessionId?: string;
  /** When set, restricts results to these session ids (query-time replay user filter). */
  sessionIds?: string[];
  schemaId?: string;
  variantId?: string;
  limit?: number;
  offset?: number;
}

export interface ReplayUserFilter {
  userId?: string;
  userEmail?: string;
}

export interface ReplaySessionIdentity {
  userId: string | null;
  userEmail: string | null;
  identifiedMidSession: boolean;
}

export type AnalyticsGroupBy =
  | "eventType"
  | "sessionId"
  | "schemaId"
  | "variantId"
  | "audienceKey"
  | "audienceDefinitionVersion"
  | "bindingId"
  | "bindingVersion"
  | "decisionId"
  | "pageKey"
  | "locale";

export interface AggregationFilters {
  orgId: string;
  groupBy?: AnalyticsGroupBy;
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

export type AudiencePerformanceSampleStatus =
  | "insufficient_exposed_accounts"
  | "outcomes_suppressed"
  | "available";

export interface AudiencePerformanceReportBinding {
  audienceDefinitionVersion: number | null;
  bindingId: string;
  bindingVersion: number;
  sampleStatus: AudiencePerformanceSampleStatus;
  servedDecisionCount: number | null;
  renderedDecisionCount: number | null;
  exposedAccountCount: number | null;
  outcomeAccountCount: number | null;
  outcomeRate: number | null;
}

export interface AudiencePerformanceReport {
  audienceKey: string;
  from: string;
  to: string;
  rateLabel: "observational_not_causal";
  rateDenominator: "exposedAccountCount";
  minimumSampleSize: number;
  bindings: AudiencePerformanceReportBinding[];
}

export interface AnalyticsStorage {
  ingest(event: AnalyticsEventDTO): Promise<void>;
  ingestBatch(events: AnalyticsEventDTO[]): Promise<void>;
  query(filters: EventQueryFilters): Promise<AnalyticsEventDTO[]>;
  aggregate(filters: AggregationFilters): Promise<AggregationResult[]>;
  conversionRates(filters: ConversionFilters): Promise<ConversionResult[]>;
  segmentEvents(filters: SegmentEventsInput): Promise<SegmentEventsResult>;
  /** Sessions where any event (or user_identified) carries the user — O1 stitch at read time. */
  listReplaySessionIdsForUser(orgId: string, filter: ReplayUserFilter): Promise<string[]>;
  loadReplaySessionIdentities(
    orgId: string,
    sessionIds: string[],
  ): Promise<Record<string, ReplaySessionIdentity>>;
}

export interface SegmentEventsInput {
  orgId: string;
  signalCategories?: string[];
  from?: Date;
  to?: Date;
  limit?: number;
}

export interface SegmentCluster extends ExperienceAttributionDimensions {
  eventType: string;
  schemaId: string | null;
  variantId: string | null;
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
  listReplaySessionIdsForUser(orgId: string, filter: ReplayUserFilter): Promise<string[]>;
  loadReplaySessionIdentities(
    orgId: string,
    sessionIds: string[],
  ): Promise<Record<string, ReplaySessionIdentity>>;
}
