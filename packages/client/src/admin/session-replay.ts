import { apiFetch } from "../lib/api";

export interface ReplaySessionSummary {
  sessionId: string;
  chunkCount: number;
  lastTimestamp: string;
  storageKeys: string[];
  userId: string | null;
  userEmail: string | null;
  identifiedMidSession: boolean;
}

export interface ReplayChunkPreview {
  storageKey: string;
  eventCount: number;
}

export interface ReplaySessionListFilter {
  userId?: string;
  userEmail?: string;
  q?: string;
}

function replaySessionsQuery(filter?: ReplaySessionListFilter): string {
  if (!filter) return "";
  const params = new URLSearchParams();
  if (filter.userId?.trim()) params.set("userId", filter.userId.trim());
  if (filter.userEmail?.trim()) params.set("userEmail", filter.userEmail.trim());
  if (filter.q?.trim()) params.set("q", filter.q.trim());
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function fetchReplaySessions(
  filter?: ReplaySessionListFilter,
): Promise<ReplaySessionSummary[]> {
  const body = await apiFetch<{ data?: { sessions?: ReplaySessionSummary[] } }>(
    `/api/analytics/replay/sessions${replaySessionsQuery(filter)}`,
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
