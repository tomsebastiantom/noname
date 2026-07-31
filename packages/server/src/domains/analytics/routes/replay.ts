import type { Hono } from "hono";
import { parseLimitOffset } from "../../../shared/pagination";
import { notFound, ok } from "../../../shared/respond";
import {
  assertReplayStorageKey,
  denyUnlessAnalyticsView,
  requireTrustedOrgId,
} from "../read-guards";
import type { AnalyticsRouteDeps } from "./deps";

function replayChunkKeyFromPath(path: string): string {
  const marker = "/replay/chunks/";
  const idx = path.indexOf(marker);
  if (idx === -1) return "";
  return decodeURIComponent(path.slice(idx + marker.length));
}

export function registerAnalyticsReplayRoutes(routes: Hono, deps: AnalyticsRouteDeps): void {
  const { service, replayStorage } = deps;

  routes.get("/replay/sessions", async (c) => {
    const denied = await denyUnlessAnalyticsView(c);
    if (denied) return denied;
    const orgId = requireTrustedOrgId(c);
    if (orgId instanceof Response) return orgId;

    const { limit } = parseLimitOffset(c, { defaultLimit: 500, maxLimit: 500 });
    const events = await service.query({
      orgId,
      eventType: "session_replay.chunk",
      limit,
    });

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

    const sessions = [...bySession.values()].sort((a, b) =>
      b.lastTimestamp.localeCompare(a.lastTimestamp),
    );
    return ok(c, { sessions });
  });

  routes.get("/replay/chunks/*", async (c) => {
    const denied = await denyUnlessAnalyticsView(c);
    if (denied) return denied;
    const orgId = requireTrustedOrgId(c);
    if (orgId instanceof Response) return orgId;
    if (!replayStorage) {
      return c.json({ error: "Replay storage not configured" }, 503);
    }

    const storageKey = replayChunkKeyFromPath(c.req.path);
    if (!storageKey || !assertReplayStorageKey(orgId, storageKey)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const json = await replayStorage.getChunk(storageKey);
    if (json === null) {
      return notFound(c, "Replay chunk not found");
    }
    return c.body(json, 200, { "Content-Type": "application/json" });
  });
}
