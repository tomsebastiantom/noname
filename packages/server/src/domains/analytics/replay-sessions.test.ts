import { describe, expect, it } from "vitest";
import type { AnalyticsEventDTO } from "./ports";
import { groupReplayChunkEvents, parseReplayUserFilter } from "./replay-sessions";

describe("parseReplayUserFilter", () => {
  it("accepts userId", () => {
    expect(parseReplayUserFilter({ userId: "user-123" })).toEqual({ userId: "user-123" });
  });

  it("accepts userEmail", () => {
    expect(parseReplayUserFilter({ userEmail: "Editor@Example.com" })).toEqual({
      userEmail: "editor@example.com",
    });
  });

  it("routes q with @ to email", () => {
    expect(parseReplayUserFilter({ q: "editor@zitadel.localhost" })).toEqual({
      userEmail: "editor@zitadel.localhost",
    });
  });

  it("routes q without @ to userId", () => {
    expect(parseReplayUserFilter({ q: "zitadel-sub-1" })).toEqual({ userId: "zitadel-sub-1" });
  });

  it("rejects invalid values", () => {
    expect(parseReplayUserFilter({ userId: "../evil" })).toBeNull();
    expect(parseReplayUserFilter({ q: "not-an-email@" })).toBeNull();
  });
});

describe("groupReplayChunkEvents", () => {
  const chunk = (sessionId: string, ts: string, key: string): AnalyticsEventDTO => ({
    eventId: crypto.randomUUID(),
    orgId: "org-1",
    eventType: "session_replay.chunk",
    eventSource: "frontend",
    timestamp: new Date(ts),
    sessionId,
    schemaId: null,
    variantId: null,
    contextHash: null,
    meta: { storageKey: key },
  });

  it("groups chunks by session and sorts by last activity", () => {
    const grouped = groupReplayChunkEvents([
      chunk("s1", "2026-01-01T10:00:00Z", "replays/org-1/s1/a.json"),
      chunk("s1", "2026-01-01T11:00:00Z", "replays/org-1/s1/b.json"),
      chunk("s2", "2026-01-01T12:00:00Z", "replays/org-1/s2/a.json"),
    ]);
    expect(grouped).toHaveLength(2);
    expect(grouped[0]?.sessionId).toBe("s2");
    expect(grouped[1]?.chunkCount).toBe(2);
    expect(grouped[1]?.storageKeys).toHaveLength(2);
  });
});
