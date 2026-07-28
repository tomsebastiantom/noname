import { apiHeaders } from "../auth/session";

export interface ReplaySessionSummary {
  sessionId: string;
  chunkCount: number;
  lastTimestamp: string;
  storageKeys: string[];
}

export interface ReplayChunkPreview {
  storageKey: string;
  eventCount: number;
}

async function parseApiError(res: Response, fallback: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  throw new Error(body.error ?? `${fallback} (${res.status})`);
}

export async function fetchReplaySessions(): Promise<ReplaySessionSummary[]> {
  const res = await fetch("/api/analytics/replay/sessions", { headers: apiHeaders() });
  if (!res.ok) await parseApiError(res, "Failed to load replay sessions");
  const body = (await res.json()) as { data?: { sessions?: ReplaySessionSummary[] } };
  return body.data?.sessions ?? [];
}

export async function fetchReplayChunk(storageKey: string): Promise<unknown[]> {
  const encodedKey = storageKey.split("/").map(encodeURIComponent).join("/");
  const res = await fetch(`/api/analytics/replay/chunks/${encodedKey}`, {
    headers: apiHeaders(),
  });
  if (!res.ok) await parseApiError(res, "Failed to load replay chunk");
  const events = (await res.json()) as unknown;
  return Array.isArray(events) ? events : [];
}

/** Load and merge all chunks for a session (in storage key order). */
export async function fetchReplaySessionEvents(storageKeys: string[]): Promise<unknown[]> {
  const merged: unknown[] = [];
  for (const key of storageKeys) {
    const chunk = await fetchReplayChunk(key);
    merged.push(...chunk);
  }
  return merged;
}
