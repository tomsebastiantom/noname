import { Hono } from "hono";
import { getOrgId } from "../../shared/org";
import { created, ok } from "../../shared/respond";
import type { AnalyticsService } from "./ports";

export function createAnalyticsRoutes(service: AnalyticsService) {
  const routes = new Hono();

  routes.post("/track", async (c) => {
    const orgId = getOrgId(c);
    const body = await c.req.json();
    const result = await service.track(orgId, body);
    return created(c, result);
  });

  routes.get("/events", async (c) => {
    const filters = {
      orgId: c.req.query("orgId") || undefined,
      eventType: c.req.query("eventType") || undefined,
      eventSource: c.req.query("eventSource") as any,
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
      groupBy: c.req.query("groupBy") as any,
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
