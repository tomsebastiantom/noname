import { Hono } from "hono";
import { getUserId, requireHeaderOrgId } from "../../shared/org";
import { parseLimitOffset } from "../../shared/pagination";
import { created, notFound, ok } from "../../shared/respond";
import { enrichEventMeta, parseErrorIngest, parseTrackIngest } from "./browser-ingest";
import type { AnalyticsService } from "./ports";
import {
  assertReplayStorageKey,
  denyUnlessAnalyticsView,
  requireTrustedOrgId,
} from "./read-guards";
import type { ReplayBlobStorage } from "./replay-storage";

function replayChunkKeyFromPath(path: string): string {
  const marker = "/replay/chunks/";
  const idx = path.indexOf(marker);
  if (idx === -1) return "";
  return decodeURIComponent(path.slice(idx + marker.length));
}

export function createAnalyticsRoutes(
  service: AnalyticsService,
  replayStorage: ReplayBlobStorage | null = null,
) {
  const routes = new Hono();

  routes.post("/track", async (c) => {
    const body = await c.req.json();
    const { events } = parseTrackIngest(body);
    const orgId = requireHeaderOrgId(c);
    if (orgId instanceof Response) return orgId;
    if (events.length === 0) {
      return c.json({ error: "no events" }, 400);
    }
    const headerUserId = getUserId(c);
    const attributed = events.map((event) => ({
      ...event,
      meta: enrichEventMeta(headerUserId, event.meta),
    }));
    const results =
      attributed.length === 1
        ? [await service.track(orgId, attributed[0]!)]
        : await service.trackBatch(orgId, attributed);
    return created(c, { accepted: results.length, events: results });
  });

  routes.post("/error", async (c) => {
    const body = await c.req.json();
    const { reports } = parseErrorIngest(body);
    const orgId = requireHeaderOrgId(c);
    if (orgId instanceof Response) return orgId;
    const headerUserId = getUserId(c);
    for (const report of reports) {
      const sessionId = typeof report.sessionId === "string" ? report.sessionId : "";
      await service.track(orgId, {
        eventType: "frontend.error",
        sessionId,
        meta: enrichEventMeta(headerUserId, report),
      });
    }
    return created(c, { accepted: reports.length });
  });

  routes.post("/replay", async (c) => {
    const body = (await c.req.json()) as {
      sessionId?: string;
      timestamp?: number;
      events?: unknown[];
    };
    const orgId = requireHeaderOrgId(c);
    if (orgId instanceof Response) return orgId;

    const sessionId = body.sessionId ?? "";
    const timestamp = body.timestamp ?? Date.now();
    const events = Array.isArray(body.events) ? body.events : [];
    let storageKey: string | null = null;

    if (replayStorage && events.length > 0) {
      const chunkId = `${timestamp}-${crypto.randomUUID().slice(0, 8)}`;
      storageKey = await replayStorage.putChunk(orgId, sessionId, chunkId, JSON.stringify(events));
    }

    await service.track(orgId, {
      eventType: "session_replay.chunk",
      sessionId,
      meta: enrichEventMeta(getUserId(c), {
        eventCount: events.length,
        timestamp,
        storageKey,
      }),
    });
    return created(c, { accepted: true, storageKey });
  });

  routes.get("/events", async (c) => {
    const denied = await denyUnlessAnalyticsView(c);
    if (denied) return denied;
    const orgId = requireTrustedOrgId(c);
    if (orgId instanceof Response) return orgId;

    const { limit, offset } = parseLimitOffset(c);
    const filters = {
      orgId,
      eventType: c.req.query("eventType") || undefined,
      eventSource: c.req.query("eventSource") as "server" | "frontend" | undefined,
      from: c.req.query("from") ? new Date(c.req.query("from")!) : undefined,
      to: c.req.query("to") ? new Date(c.req.query("to")!) : undefined,
      sessionId: c.req.query("sessionId") || undefined,
      schemaId: c.req.query("schemaId") || undefined,
      contextHash: c.req.query("contextHash") || undefined,
      limit,
      offset,
    };
    const events = await service.query(filters);
    return ok(c, events);
  });

  routes.get("/aggregations", async (c) => {
    const denied = await denyUnlessAnalyticsView(c);
    if (denied) return denied;
    const orgId = requireTrustedOrgId(c);
    if (orgId instanceof Response) return orgId;

    const { limit } = parseLimitOffset(c, { defaultLimit: 20, maxLimit: 200 });
    const filters = {
      orgId,
      groupBy: c.req.query("groupBy") as
        | "eventType"
        | "sessionId"
        | "schemaId"
        | "contextHash"
        | undefined,
      from: c.req.query("from") ? new Date(c.req.query("from")!) : undefined,
      to: c.req.query("to") ? new Date(c.req.query("to")!) : undefined,
      limit,
    };
    const results = await service.aggregate(filters);
    return ok(c, results);
  });

  routes.get("/conversions", async (c) => {
    const denied = await denyUnlessAnalyticsView(c);
    if (denied) return denied;
    const orgId = requireTrustedOrgId(c);
    if (orgId instanceof Response) return orgId;

    const filters = {
      orgId,
      schemaId: c.req.query("schemaId") || undefined,
      from: c.req.query("from") ? new Date(c.req.query("from")!) : undefined,
      to: c.req.query("to") ? new Date(c.req.query("to")!) : undefined,
    };
    const results = await service.conversionRates(filters);
    return ok(c, results);
  });

  routes.post("/segment-events", async (c) => {
    const denied = await denyUnlessAnalyticsView(c);
    if (denied) return denied;
    const orgId = requireTrustedOrgId(c);
    if (orgId instanceof Response) return orgId;

    const body = await c.req.json();
    const filters = {
      orgId,
      signalCategories: body.signalCategories || undefined,
      from: body.from ? new Date(body.from) : undefined,
      to: body.to ? new Date(body.to) : undefined,
      limit: body.limit || undefined,
    };
    const results = await service.segmentEvents(filters);
    return ok(c, results);
  });

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

  return routes;
}
