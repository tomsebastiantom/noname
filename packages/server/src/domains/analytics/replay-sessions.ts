import type { AnalyticsEventDTO, AnalyticsService } from "./ports";

export interface ReplaySessionIdentity {
  userId: string | null;
  userEmail: string | null;
  identifiedMidSession: boolean;
}

export interface ReplaySessionSummary {
  sessionId: string;
  chunkCount: number;
  lastTimestamp: string;
  storageKeys: string[];
  userId: string | null;
  userEmail: string | null;
  identifiedMidSession: boolean;
}

export interface ReplayUserFilter {
  userId?: string;
  userEmail?: string;
}

const USER_ID_RE = /^[a-zA-Z0-9._-]{1,128}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{1,253}$/;

/** Parse optional `userId`, `userEmail`, or combined `q` search params. */
export function parseReplayUserFilter(search: {
  userId?: string;
  userEmail?: string;
  q?: string;
}): ReplayUserFilter | null {
  const userId = search.userId?.trim();
  const userEmail = search.userEmail?.trim().toLowerCase();
  const q = search.q?.trim();

  if (userId) {
    if (!USER_ID_RE.test(userId)) return null;
    return { userId };
  }
  if (userEmail) {
    if (!EMAIL_RE.test(userEmail)) return null;
    return { userEmail };
  }
  if (!q) return null;

  if (q.includes("@")) {
    const normalized = q.toLowerCase();
    if (!EMAIL_RE.test(normalized)) return null;
    return { userEmail: normalized };
  }
  if (!USER_ID_RE.test(q)) return null;
  return { userId: q };
}

export function groupReplayChunkEvents(events: AnalyticsEventDTO[]): ReplaySessionSummary[] {
  const bySession = new Map<
    string,
    { sessionId: string; chunkCount: number; lastTimestamp: string; storageKeys: string[] }
  >();

  for (const event of events) {
    const sessionId = event.sessionId || "unknown";
    const storageKey = typeof event.meta.storageKey === "string" ? event.meta.storageKey : null;
    const existing = bySession.get(sessionId);
    const ts = event.timestamp.toISOString();
    if (existing) {
      existing.chunkCount += 1;
      if (ts > existing.lastTimestamp) existing.lastTimestamp = ts;
      if (storageKey) existing.storageKeys.push(storageKey);
    } else {
      bySession.set(sessionId, {
        sessionId,
        chunkCount: 1,
        lastTimestamp: ts,
        storageKeys: storageKey ? [storageKey] : [],
      });
    }
  }

  return [...bySession.values()]
    .sort((a, b) => b.lastTimestamp.localeCompare(a.lastTimestamp))
    .map((row) => ({
      ...row,
      userId: null,
      userEmail: null,
      identifiedMidSession: false,
    }));
}

function mergeIdentity(
  summary: ReplaySessionSummary,
  identity: ReplaySessionIdentity | undefined,
): ReplaySessionSummary {
  if (!identity) return summary;
  return {
    ...summary,
    userId: identity.userId,
    userEmail: identity.userEmail,
    identifiedMidSession: identity.identifiedMidSession,
  };
}

export async function listReplaySessions(
  service: Pick<
    AnalyticsService,
    "query" | "listReplaySessionIdsForUser" | "loadReplaySessionIdentities"
  >,
  orgId: string,
  options: { limit?: number; userFilter?: ReplayUserFilter | null },
): Promise<ReplaySessionSummary[]> {
  const limit = options.limit ?? 500;
  const userFilter = options.userFilter ?? null;

  let sessionIds: string[] | undefined;
  if (userFilter) {
    sessionIds = await service.listReplaySessionIdsForUser(orgId, userFilter);
    if (sessionIds.length === 0) return [];
  }

  const events = await service.query({
    orgId,
    eventType: "session_replay.chunk",
    sessionIds,
    limit,
  });

  const summaries = groupReplayChunkEvents(events);
  const identities = await service.loadReplaySessionIdentities(
    orgId,
    summaries.map((s) => s.sessionId),
  );

  return summaries.map((s) => mergeIdentity(s, identities[s.sessionId]));
}
