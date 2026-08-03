const TRACE_ID_RE = /^[0-9a-f]{32}$/;
const SPAN_ID_RE = /^[0-9a-f]{16}$/;
const MAX_SPANS_PER_BATCH = 100;
const MAX_SPAN_NAME_LENGTH = 256;

export interface BrowserSpanInput {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTimeMs: number;
  durationMs: number;
  attributes?: Record<string, string>;
  status?: "ok" | "error";
}

function sanitizeAttributes(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof key !== "string" || key.length === 0 || key.length > 128) continue;
    if (typeof value !== "string" || value.length > 512) continue;
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseSpan(raw: unknown): BrowserSpanInput | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const traceId = typeof record.traceId === "string" ? record.traceId.toLowerCase() : "";
  const spanId = typeof record.spanId === "string" ? record.spanId.toLowerCase() : "";
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const startTimeMs = typeof record.startTimeMs === "number" ? record.startTimeMs : NaN;
  const durationMs = typeof record.durationMs === "number" ? record.durationMs : NaN;
  const parentSpanId =
    typeof record.parentSpanId === "string" ? record.parentSpanId.toLowerCase() : undefined;

  if (!TRACE_ID_RE.test(traceId) || !SPAN_ID_RE.test(spanId)) return null;
  if (parentSpanId && !SPAN_ID_RE.test(parentSpanId)) return null;
  if (!name || name.length > MAX_SPAN_NAME_LENGTH) return null;
  if (!Number.isFinite(startTimeMs) || !Number.isFinite(durationMs)) return null;
  if (durationMs < 0 || durationMs > 600_000) return null;

  const status = record.status === "error" ? "error" : "ok";
  return {
    traceId,
    spanId,
    parentSpanId,
    name,
    startTimeMs: Math.round(startTimeMs),
    durationMs: Math.round(durationMs),
    attributes: sanitizeAttributes(record.attributes),
    status,
  };
}

/** Normalize browser-sdk span payloads: `{ spans }` or bare array. */
export function parseSpanIngest(body: unknown): { spans: BrowserSpanInput[] } {
  const rawSpans = (() => {
    if (Array.isArray(body)) return body;
    if (body && typeof body === "object") {
      const record = body as { spans?: unknown[] };
      if (Array.isArray(record.spans)) return record.spans;
    }
    return [];
  })();

  const spans: BrowserSpanInput[] = [];
  for (const raw of rawSpans.slice(0, MAX_SPANS_PER_BATCH)) {
    const span = parseSpan(raw);
    if (span) spans.push(span);
  }
  return { spans };
}
