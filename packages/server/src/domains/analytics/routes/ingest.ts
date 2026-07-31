import type { Hono } from "hono";
import { getUserId, requireHeaderOrgId } from "../../../shared/org";
import { created } from "../../../shared/respond";
import { enrichEventMeta, parseErrorIngest, parseTrackIngest } from "../browser-ingest";
import type { AnalyticsRouteDeps } from "./deps";

export function registerAnalyticsIngestRoutes(routes: Hono, deps: AnalyticsRouteDeps): void {
  const { service, replayStorage } = deps;

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
}
