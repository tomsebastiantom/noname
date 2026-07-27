import type { TrackEventInput } from "./ports";

/** Normalize browser-sdk payloads: array, `{ orgId, events }`, or single event. */
export function parseTrackIngest(body: unknown): {
  orgId?: string;
  events: TrackEventInput[];
} {
  if (Array.isArray(body)) {
    return { events: body as TrackEventInput[] };
  }
  if (body && typeof body === "object") {
    const record = body as { orgId?: string; events?: TrackEventInput[] };
    if (Array.isArray(record.events)) {
      return { orgId: record.orgId, events: record.events };
    }
    return { events: [body as TrackEventInput] };
  }
  return { events: [] };
}

export function parseErrorIngest(body: unknown): {
  orgId?: string;
  reports: Record<string, unknown>[];
} {
  if (Array.isArray(body)) {
    return { reports: body as Record<string, unknown>[] };
  }
  if (body && typeof body === "object") {
    const record = body as {
      orgId?: string;
      reports?: Record<string, unknown>[];
      report?: Record<string, unknown>;
    };
    if (Array.isArray(record.reports)) {
      return { orgId: record.orgId, reports: record.reports };
    }
    if (record.report) {
      return { orgId: record.orgId, reports: [record.report] };
    }
    return { reports: [body as Record<string, unknown>] };
  }
  return { reports: [] };
}
