import type { Hono } from "hono";
import { parseLimitOffset } from "../../../shared/pagination";
import { ok } from "../../../shared/respond";
import { dateRangeFromQuery } from "../query-filters";
import { denyUnlessAnalyticsView, requireTrustedOrgId } from "../read-guards";
import type { AnalyticsRouteDeps } from "./deps";

export function registerAnalyticsQueryRoutes(routes: Hono, deps: AnalyticsRouteDeps): void {
  const { service } = deps;

  routes.get("/events", async (c) => {
    const denied = await denyUnlessAnalyticsView(c);
    if (denied) return denied;
    const orgId = requireTrustedOrgId(c);
    if (orgId instanceof Response) return orgId;

    const { limit, offset } = parseLimitOffset(c);
    const { from, to } = dateRangeFromQuery(c);
    const filters = {
      orgId,
      eventType: c.req.query("eventType") || undefined,
      eventSource: c.req.query("eventSource") as "server" | "frontend" | undefined,
      from,
      to,
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
    const { from, to } = dateRangeFromQuery(c);
    const filters = {
      orgId,
      groupBy: c.req.query("groupBy") as
        | "eventType"
        | "sessionId"
        | "schemaId"
        | "contextHash"
        | undefined,
      from,
      to,
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

    const { from, to } = dateRangeFromQuery(c);
    const filters = {
      orgId,
      schemaId: c.req.query("schemaId") || undefined,
      from,
      to,
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
}
