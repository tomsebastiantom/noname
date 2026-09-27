import { apiFetch } from "../lib/api";

export interface AnalyticsEventRow {
  eventId: string;
  orgId: string;
  eventType: string;
  eventSource: "server" | "frontend";
  timestamp: string;
  sessionId: string;
  schemaId: string | null;
  variantId: string | null;
  audienceKey: string | null;
  audienceDefinitionVersion: number | null;
  bindingId: string | null;
  bindingVersion: number | null;
  decisionId: string | null;
  pageKey: string | null;
  locale: string | null;
  meta: Record<string, unknown>;
}

export interface AnalyticsAggregationRow {
  key: string;
  count: number;
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

export interface AnalyticsEventQueryFilters {
  eventType?: string;
  eventSource?: "server" | "frontend";
  from?: string;
  to?: string;
  sessionId?: string;
  schemaId?: string;
  variantId?: string;
  audienceKey?: string;
  audienceDefinitionVersion?: number;
  bindingId?: string;
  bindingVersion?: number;
  decisionId?: string;
  pageKey?: string;
  locale?: string;
}

export async function fetchAnalyticsEvents(
  limit = 50,
  filters: AnalyticsEventQueryFilters = {},
): Promise<AnalyticsEventRow[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const body = await apiFetch<{ data?: AnalyticsEventRow[] }>(`/api/analytics/events?${params}`);
  return body.data ?? [];
}

export async function fetchAnalyticsAggregations(
  groupBy: AnalyticsGroupBy = "eventType",
  limit = 50,
): Promise<AnalyticsAggregationRow[]> {
  const params = new URLSearchParams({ groupBy, limit: String(limit) });
  const body = await apiFetch<{ data?: AnalyticsAggregationRow[] }>(
    `/api/analytics/aggregations?${params}`,
  );
  return body.data ?? [];
}
