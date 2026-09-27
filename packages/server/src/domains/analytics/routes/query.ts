import type { Hono } from "hono";
import { parseLimitOffset } from "../../../shared/pagination";
import { ok } from "../../../shared/respond";
import { suppressSmallAudiencePerformance } from "../audience-performance";
import type { AnalyticsGroupBy } from "../ports";
import { dateRangeFromQuery } from "../query-filters";
import { denyUnlessAnalyticsView, requireTrustedOrgId } from "../read-guards";
import type { AnalyticsRouteDeps } from "./deps";

function versionQuery(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const version = Number(value);
  return Number.isSafeInteger(version) && version >= 0 ? version : undefined;
}

const AUDIENCE_KEY_PATTERN = /^[a-z][a-z0-9_-]{1,63}$/;
const MAX_PERFORMANCE_RANGE_MS = 30 * 24 * 60 * 60 * 1000;

function performanceDateRange(
  fromRaw: string | undefined,
  toRaw: string | undefined,
  now = new Date(),
): { from: Date; to: Date } | null {
  const cutoff = now.getTime() - MAX_PERFORMANCE_RANGE_MS;
  const from = fromRaw ? new Date(fromRaw) : new Date(cutoff);
  const to = toRaw ? new Date(toRaw) : now;
  const fromMs = from.getTime();
  const toMs = to.getTime();
  if (
    !Number.isFinite(fromMs) ||
    !Number.isFinite(toMs) ||
    fromMs < cutoff ||
    toMs > now.getTime() ||
    fromMs > toMs ||
    toMs - fromMs > MAX_PERFORMANCE_RANGE_MS
  ) {
    return null;
  }
  return { from, to };
}

export function registerAnalyticsQueryRoutes(routes: Hono, deps: AnalyticsRouteDeps): void {
  const { service, getAudiencePerformance } = deps;

  routes.get("/audiences/:key/performance", async (c) => {
    const denied = await denyUnlessAnalyticsView(c);
    if (denied) return denied;
    const orgId = requireTrustedOrgId(c);
    if (orgId instanceof Response) return orgId;

    const audienceKey = c.req.param("key");
    if (!AUDIENCE_KEY_PATTERN.test(audienceKey)) {
      return c.json({ error: "invalid audience key" }, 400);
    }
    const range = performanceDateRange(c.req.query("from"), c.req.query("to"));
    if (!range) {
      return c.json({ error: "date range must be valid and within the last 30 days" }, 400);
    }

    const bindings = await getAudiencePerformance({ orgId, audienceKey, ...range });
    const result = suppressSmallAudiencePerformance({ audienceKey, ...range, bindings });
    return ok(c, result);
  });

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
      variantId: c.req.query("variantId") || undefined,
      audienceKey: c.req.query("audienceKey") || undefined,
      audienceDefinitionVersion: versionQuery(c.req.query("audienceDefinitionVersion")),
      bindingId: c.req.query("bindingId") || undefined,
      bindingVersion: versionQuery(c.req.query("bindingVersion")),
      decisionId: c.req.query("decisionId") || undefined,
      pageKey: c.req.query("pageKey") || undefined,
      locale: c.req.query("locale") || undefined,
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
      groupBy: c.req.query("groupBy") as AnalyticsGroupBy | undefined,
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
      variantId: c.req.query("variantId") || undefined,
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
