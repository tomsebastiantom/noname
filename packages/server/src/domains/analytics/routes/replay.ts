import type { Hono } from "hono";
import { parseLimitOffset } from "../../../shared/pagination";
import { notFound, ok } from "../../../shared/respond";
import {
  assertReplayStorageKey,
  denyUnlessSessionReplay,
  requireTrustedOrgId,
} from "../read-guards";
import { listReplaySessions, parseReplayUserFilter } from "../replay-sessions";
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
    const denied = await denyUnlessSessionReplay(c);
    if (denied) return denied;
    const orgId = requireTrustedOrgId(c);
    if (orgId instanceof Response) return orgId;

    const { limit } = parseLimitOffset(c, { defaultLimit: 500, maxLimit: 500 });
    const userFilter = parseReplayUserFilter({
      userId: c.req.query("userId"),
      userEmail: c.req.query("userEmail"),
      q: c.req.query("q"),
    });
    if (
      (c.req.query("userId") || c.req.query("userEmail") || c.req.query("q")) &&
      userFilter === null
    ) {
      return c.json({ error: "Invalid user search filter" }, 400);
    }

    const sessions = await listReplaySessions(service, orgId, { limit, userFilter });
    return ok(c, { sessions });
  });

  routes.get("/replay/chunks/*", async (c) => {
    const denied = await denyUnlessSessionReplay(c);
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
