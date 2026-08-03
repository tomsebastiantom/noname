import { apiFetch } from "../lib/api";

export interface TraceSummaryRow {
  traceId: string;
  rootOperation: string;
  durationMs: number;
  startTime: string;
  spanCount: number;
  hasError: boolean;
}

export interface TraceSpanRow {
  spanId: string;
  operationName: string;
  durationMs: number;
  startTime: string;
  depth: number;
  serviceName: string;
  tags: Record<string, string>;
}

export interface TraceDetail {
  summary: TraceSummaryRow;
  spans: TraceSpanRow[];
}

export async function fetchTraces(limit = 50, lookback = "1h"): Promise<TraceSummaryRow[]> {
  const params = new URLSearchParams({ limit: String(limit), lookback });
  const body = await apiFetch<{ data?: TraceSummaryRow[] }>(`/api/analytics/traces?${params}`);
  return body.data ?? [];
}

export async function fetchTraceDetail(traceId: string): Promise<TraceDetail | null> {
  const body = await apiFetch<{ data?: TraceDetail }>(
    `/api/analytics/traces/${encodeURIComponent(traceId)}`,
  );
  return body.data ?? null;
}
