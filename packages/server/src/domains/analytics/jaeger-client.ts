import { ServiceUnavailableError } from "../../shared/domain-error";

const DEFAULT_JAEGER_QUERY_URL = "http://localhost:16686";
const DEFAULT_SERVICE = "noname-server";

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

interface JaegerTag {
  key: string;
  type?: string;
  value: string | number | boolean;
}

interface JaegerSpan {
  traceID: string;
  spanID: string;
  operationName: string;
  startTime: number;
  duration: number;
  tags?: JaegerTag[];
  references?: Array<{ refType: string; traceID: string; spanID: string }>;
  processID?: string;
}

interface JaegerProcess {
  serviceName: string;
}

interface JaegerTrace {
  traceID: string;
  spans: JaegerSpan[];
  processes?: Record<string, JaegerProcess>;
}

function jaegerQueryBase(): string {
  return (process.env.JAEGER_QUERY_URL || DEFAULT_JAEGER_QUERY_URL).replace(/\/$/, "");
}

function tagValue(tags: JaegerTag[] | undefined, key: string): string | null {
  const hit = tags?.find((t) => t.key === key);
  if (hit === undefined || hit.value === null) return null;
  return String(hit.value);
}

function traceHasOrgId(trace: JaegerTrace, orgId: string): boolean {
  return trace.spans.some((span) => tagValue(span.tags, "org.id") === orgId);
}

function rootSpan(trace: JaegerTrace): JaegerSpan | null {
  if (trace.spans.length === 0) return null;
  const childSpanIds = new Set<string>();
  for (const span of trace.spans) {
    for (const ref of span.references ?? []) {
      if (ref.refType === "CHILD_OF") {
        childSpanIds.add(span.spanID);
      }
    }
  }
  const roots = trace.spans.filter((s) => !childSpanIds.has(s.spanID));
  if (roots.length === 0) return trace.spans[0] ?? null;
  return roots.reduce((a, b) => (a.startTime <= b.startTime ? a : b));
}

export function summarizeJaegerTrace(trace: JaegerTrace): TraceSummaryRow | null {
  const root = rootSpan(trace);
  if (!root) return null;
  const hasError = trace.spans.some((span) => {
    const code = tagValue(span.tags, "error");
    const otelStatus = tagValue(span.tags, "otel.status_code");
    return code === "true" || otelStatus === "ERROR";
  });
  return {
    traceId: trace.traceID,
    rootOperation: root.operationName,
    durationMs: Math.round(root.duration / 1000),
    startTime: new Date(root.startTime / 1000).toISOString(),
    spanCount: trace.spans.length,
    hasError,
  };
}

function spanDepth(span: JaegerSpan, byId: Map<string, JaegerSpan>): number {
  let depth = 0;
  let current: JaegerSpan | undefined = span;
  const seen = new Set<string>();
  while (current) {
    const parentRef = current.references?.find((r) => r.refType === "CHILD_OF");
    if (!parentRef) break;
    if (seen.has(parentRef.spanID)) break;
    seen.add(parentRef.spanID);
    const parent = byId.get(parentRef.spanID);
    if (!parent) break;
    depth += 1;
    current = parent;
  }
  return depth;
}

export function flattenJaegerTrace(trace: JaegerTrace): TraceSpanRow[] {
  const byId = new Map(trace.spans.map((s) => [s.spanID, s]));
  const processes = trace.processes ?? {};
  return trace.spans
    .map((span) => {
      const tags: Record<string, string> = {};
      for (const tag of span.tags ?? []) {
        tags[tag.key] = String(tag.value);
      }
      const serviceName =
        span.processID && processes[span.processID]
          ? (processes[span.processID]?.serviceName ?? "unknown")
          : "unknown";
      return {
        spanId: span.spanID,
        operationName: span.operationName,
        durationMs: Math.round(span.duration / 1000),
        startTime: new Date(span.startTime / 1000).toISOString(),
        depth: spanDepth(span, byId),
        serviceName,
        tags,
      };
    })
    .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.depth - b.depth);
}

async function jaegerFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${jaegerQueryBase()}${path}`);
  if (!res.ok) {
    throw new ServiceUnavailableError(`Jaeger query failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export async function listJaegerTracesForOrg(
  orgId: string,
  options?: { limit?: number; lookback?: string },
): Promise<TraceSummaryRow[]> {
  const limit = options?.limit ?? 50;
  const lookback = options?.lookback ?? "1h";
  const tags = encodeURIComponent(JSON.stringify({ "org.id": orgId }));
  const service = encodeURIComponent(process.env.OTEL_SERVICE_NAME || DEFAULT_SERVICE);
  const path = `/api/traces?service=${service}&limit=${limit}&lookback=${lookback}&tags=${tags}`;
  const body = await jaegerFetch<{ data?: JaegerTrace[] }>(path);
  const traces = body.data ?? [];
  return traces
    .filter((trace) => traceHasOrgId(trace, orgId))
    .map(summarizeJaegerTrace)
    .filter((row): row is TraceSummaryRow => row !== null);
}

export async function getJaegerTraceForOrg(
  orgId: string,
  traceId: string,
): Promise<{ summary: TraceSummaryRow; spans: TraceSpanRow[] } | null> {
  const encodedId = encodeURIComponent(traceId);
  const body = await jaegerFetch<{ data?: JaegerTrace[] }>(`/api/traces/${encodedId}`);
  const trace = body.data?.[0];
  if (!trace || !traceHasOrgId(trace, orgId)) return null;
  const summary = summarizeJaegerTrace(trace);
  if (!summary) return null;
  return { summary, spans: flattenJaegerTrace(trace) };
}
