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
  contextHash: string | null;
  meta: Record<string, unknown>;
}

export interface AnalyticsAggregationRow {
  key: string;
  count: number;
}

export async function fetchAnalyticsEvents(limit = 50): Promise<AnalyticsEventRow[]> {
  const body = await apiFetch<{ data?: AnalyticsEventRow[] }>(
    `/api/analytics/events?limit=${limit}`,
  );
  return body.data ?? [];
}

export async function fetchAnalyticsAggregations(
  groupBy: "eventType" | "sessionId" | "schemaId" | "contextHash" = "eventType",
  limit = 50,
): Promise<AnalyticsAggregationRow[]> {
  const params = new URLSearchParams({ groupBy, limit: String(limit) });
  const body = await apiFetch<{ data?: AnalyticsAggregationRow[] }>(
    `/api/analytics/aggregations?${params}`,
  );
  return body.data ?? [];
}
