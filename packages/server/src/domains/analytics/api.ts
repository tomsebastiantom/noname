import { Hono } from "hono";
import { getOrgId } from "../../shared/org";
import { created, ok } from "../../shared/respond";
import { parseErrorIngest, parseTrackIngest } from "./browser-ingest";
import type { ReplayBlobStorage } from "./replay-storage";
import type { AnalyticsService } from "./ports";

function requireOrgId(headerOrgId: string, bodyOrgId?: string): string | null {
  return headerOrgId || bodyOrgId || null;
}

export function createAnalyticsRoutes(
  service: AnalyticsService,
  replayStorage: ReplayBlobStorage | null = null,
) {
  const routes = new Hono();

  routes.post("/track", async (c) => {
    const body = await c.req.json();
    const { orgId: bodyOrgId, events } = parseTrackIngest(body);
    const orgId = requireOrgId(getOrgId(c), bodyOrgId);
    if (!orgId) {
      return c.json({ error: "org id required" }, 400);
    }
    if (events.length === 0) {
      return c.json({ error: "no events" }, 400);
    }
    const results =
      events.length === 1
        ? [await service.track(orgId, events[0]!)]
        : await service.trackBatch(orgId, events);
    return created(c, { accepted: results.length, events: results });
  });

  routes.post("/error", async (c) => {
    const body = await c.req.json();
    const { orgId: bodyOrgId, reports } = parseErrorIngest(body);
    const orgId = requireOrgId(getOrgId(c), bodyOrgId);
    if (!orgId) {
      return c.json({ error: "org id required" }, 400);
    }
    for (const report of reports) {
      const sessionId = typeof report.sessionId === "string" ? report.sessionId : "";
      await service.track(orgId, {
        eventType: "frontend.error",
        sessionId,
        meta: report,
      });
    }
    return created(c, { accepted: reports.length });
  });

  routes.post("/replay", async (c) => {
    const body = (await c.req.json()) as {
      orgId?: string;
      sessionId?: string;
      timestamp?: number;
      events?: unknown[];
    };
    const orgId = requireOrgId(getOrgId(c), body.orgId);
    if (!orgId) {
      return c.json({ error: "org id required" }, 400);
    }

    const sessionId = body.sessionId ?? "";
    const timestamp = body.timestamp ?? Date.now();
    const events = Array.isArray(body.events) ? body.events : [];
    let storageKey: string | null = null;

    if (replayStorage && events.length > 0) {
      const chunkId = `${timestamp}-${crypto.randomUUID().slice(0, 8)}`;
      storageKey = await replayStorage.putChunk(
        orgId,
        sessionId,
        chunkId,
        JSON.stringify(events),
      );
    }

    await service.track(orgId, {
      eventType: "session_replay.chunk",
      sessionId,
      meta: {
        eventCount: events.length,
        timestamp,
        storageKey,
      },
    });
    return created(c, { accepted: true, storageKey });
  });

  routes.get("/events", async (c) => {
    const filters = {
      orgId: c.req.query("orgId") || undefined,
      eventType: c.req.query("eventType") || undefined,
      eventSource: c.req.query("eventSource") as "server" | "frontend" | undefined,
      from: c.req.query("from") ? new Date(c.req.query("from")!) : undefined,
      to: c.req.query("to") ? new Date(c.req.query("to")!) : undefined,
      sessionId: c.req.query("sessionId") || undefined,
      schemaId: c.req.query("schemaId") || undefined,
      contextHash: c.req.query("contextHash") || undefined,
      limit: c.req.query("limit") ? Number(c.req.query("limit")) : undefined,
      offset: c.req.query("offset") ? Number(c.req.query("offset")) : undefined,
    };
    const events = await service.query(filters);
    return ok(c, events);
  });

  routes.get("/aggregations", async (c) => {
    const orgId = getOrgId(c);
    const filters = {
      orgId,
      groupBy: c.req.query("groupBy") as "eventType" | "sessionId" | "schemaId" | "contextHash" | undefined,
      from: c.req.query("from") ? new Date(c.req.query("from")!) : undefined,
      to: c.req.query("to") ? new Date(c.req.query("to")!) : undefined,
      limit: c.req.query("limit") ? Number(c.req.query("limit")) : undefined,
    };
    const results = await service.aggregate(filters);
    return ok(c, results);
  });

  routes.get("/conversions", async (c) => {
    const orgId = getOrgId(c);
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
    const orgId = getOrgId(c);
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

  return routes;
}
