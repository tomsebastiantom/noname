import type { TrackEventInput } from "./ports";

const RESERVED_ATTRIBUTION_KEYS = new Set([
  "audiencekey",
  "audiencedefinitionversion",
  "definitionversion",
  "rulekey",
  "ruleid",
  "ruleversion",
  "bindingid",
  "bindingversion",
  "decisionid",
  "pagekey",
  "locale",
  "contexthash",
  "context_hash",
]);

function isReservedAttributionKey(key: string): boolean {
  const normalized = key.replaceAll("_", "").toLowerCase();
  return (
    RESERVED_ATTRIBUTION_KEYS.has(normalized) ||
    normalized.startsWith("audience") ||
    normalized.startsWith("rule") ||
    normalized.startsWith("binding") ||
    normalized.startsWith("decision")
  );
}

/** Remove server-owned attribution claims, including claims nested in client metadata. */
export function stripClientAttribution<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripClientAttribution(item)) as T;
  }
  if (value && typeof value === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (!isReservedAttributionKey(key)) {
        sanitized[key] = stripClientAttribution(item);
      }
    }
    return sanitized as T;
  }
  return value;
}

/** Keep only documented frontend event fields; attribution dimensions are server-only. */
export function sanitizeFrontendEvent(event: TrackEventInput): TrackEventInput {
  const candidate =
    event && typeof event === "object" ? (event as unknown as Record<string, unknown>) : {};
  const sanitized: TrackEventInput = {
    eventType: typeof candidate.eventType === "string" ? candidate.eventType : "",
    sessionId: typeof candidate.sessionId === "string" ? candidate.sessionId : "",
    meta:
      candidate.meta && typeof candidate.meta === "object" && !Array.isArray(candidate.meta)
        ? stripClientAttribution(candidate.meta as Record<string, unknown>)
        : {},
  };
  return sanitized;
}

/** Prefer edge-signed x-user-id; fall back to SDK meta or error report user. */
export function enrichEventMeta(
  headerUserId: string,
  meta: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const base = stripClientAttribution(meta ?? {});
  if (headerUserId) {
    return { ...base, userId: headerUserId };
  }
  if (typeof base.userId === "string" && base.userId) {
    return base;
  }
  const user = base.user;
  if (user && typeof user === "object" && user !== null) {
    const id = (user as { id?: string }).id;
    if (typeof id === "string" && id) {
      return { ...base, userId: id };
    }
  }
  return base;
}

/** Normalize browser-sdk payloads: batch array, `{ events }`, or single event. */
export function parseTrackIngest(body: unknown): { events: TrackEventInput[] } {
  if (Array.isArray(body)) {
    return { events: body as TrackEventInput[] };
  }
  if (body && typeof body === "object") {
    const record = body as { events?: TrackEventInput[] };
    if (Array.isArray(record.events)) {
      return { events: record.events };
    }
    return { events: [body as TrackEventInput] };
  }
  return { events: [] };
}

export function parseErrorIngest(body: unknown): { reports: Record<string, unknown>[] } {
  if (Array.isArray(body)) {
    return { reports: body as Record<string, unknown>[] };
  }
  if (body && typeof body === "object") {
    const record = body as {
      reports?: Record<string, unknown>[];
      report?: Record<string, unknown>;
    };
    if (Array.isArray(record.reports)) {
      return { reports: record.reports };
    }
    if (record.report) {
      return { reports: [record.report] };
    }
    return { reports: [body as Record<string, unknown>] };
  }
  return { reports: [] };
}
