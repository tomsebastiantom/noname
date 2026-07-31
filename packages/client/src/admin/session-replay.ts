import { apiFetch } from "../lib/api";

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

export async function fetchReplaySessions(): Promise<ReplaySessionSummary[]> {
  const body = await apiFetch<{ data?: { sessions?: ReplaySessionSummary[] } }>(
    "/api/analytics/replay/sessions",
  );
  return body.data?.sessions ?? [];
}

export async function fetchReplayChunk(storageKey: string): Promise<unknown[]> {
  const encodedKey = storageKey.split("/").map(encodeURIComponent).join("/");
  const events = await apiFetch<unknown>(`/api/analytics/replay/chunks/${encodedKey}`);
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
