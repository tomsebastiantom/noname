import { gzipSync } from "node:zlib";
import type { Hono } from "hono";
import { getUserId, requireHeaderOrgId } from "../../../shared/org";
import { created } from "../../../shared/respond";
import { enrichEventMeta, parseErrorIngest, parseTrackIngest } from "../browser-ingest";
import { recordBrowserSpans } from "../browser-span-export";
import { parseSpanIngest } from "../browser-span-ingest";
import { isGzipBuffer, parseReplayIngestBody } from "../replay-ingest";
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
    const raw = Buffer.from(await c.req.arrayBuffer());
    const contentType = c.req.header("Content-Type") ?? undefined;
    const orgId = requireHeaderOrgId(c);
    if (orgId instanceof Response) return orgId;

    let sessionId = "";
    let timestamp = Date.now();
    let events: unknown[] = [];
    try {
      const parsed = parseReplayIngestBody(raw, contentType);
      sessionId = parsed.sessionId;
      timestamp = parsed.timestamp;
      events = parsed.events;
    } catch {
      return c.json({ error: "invalid replay payload" }, 400);
    }

    const gzipStored =
      contentType?.includes("application/gzip") === true ||
      contentType?.includes("application/x-gzip") === true ||
      isGzipBuffer(raw);
    let storageKey: string | null = null;

    if (replayStorage && events.length > 0) {
      const chunkId = `${timestamp}-${crypto.randomUUID().slice(0, 8)}`;
      const eventsJson = JSON.stringify(events);
      const storeBody = gzipStored
        ? gzipSync(Buffer.from(eventsJson, "utf8"))
        : Buffer.from(eventsJson, "utf8");
      storageKey = await replayStorage.putChunk(orgId, sessionId, chunkId, storeBody, gzipStored);
    }

    await service.track(orgId, {
      eventType: "session_replay.chunk",
      sessionId,
      meta: enrichEventMeta(getUserId(c), {
        eventCount: events.length,
        timestamp,
        storageKey,
        compressed: gzipStored,
      }),
    });
    return created(c, { accepted: true, storageKey });
  });

  routes.post("/spans", async (c) => {
    const body = await c.req.json();
    const { spans } = parseSpanIngest(body);
    const orgId = requireHeaderOrgId(c);
    if (orgId instanceof Response) return orgId;
    if (spans.length === 0) {
      return c.json({ error: "no spans" }, 400);
    }
    const accepted = recordBrowserSpans(orgId, spans);
    return created(c, { accepted });
  });
}
