import type { TrackEventInput } from "./ports";

/** Prefer edge-signed x-user-id; fall back to SDK meta or error report user. */
export function enrichEventMeta(
  headerUserId: string,
  meta: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const base = meta ?? {};
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
