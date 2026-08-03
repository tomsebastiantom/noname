import type { Hono } from "hono";
import { parseLimitOffset } from "../../../shared/pagination";
import { notFound, ok } from "../../../shared/respond";
import { getJaegerTraceForOrg, listJaegerTracesForOrg } from "../jaeger-client";
import { denyUnlessTracesView, requireTrustedOrgId } from "../read-guards";

export function registerAnalyticsTracesRoutes(routes: Hono): void {
  routes.get("/traces", async (c) => {
    const denied = await denyUnlessTracesView(c);
    if (denied) return denied;
    const orgId = requireTrustedOrgId(c);
    if (orgId instanceof Response) return orgId;

    const { limit } = parseLimitOffset(c, { defaultLimit: 50, maxLimit: 100 });
    const lookback = c.req.query("lookback") || "1h";
    try {
      const traces = await listJaegerTracesForOrg(orgId, { limit, lookback });
      return ok(c, traces);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Jaeger unavailable";
      return c.json({ error: message }, 503);
    }
  });

  routes.get("/traces/:traceId", async (c) => {
    const denied = await denyUnlessTracesView(c);
    if (denied) return denied;
    const orgId = requireTrustedOrgId(c);
    if (orgId instanceof Response) return orgId;

    const traceId = c.req.param("traceId");
    try {
      const detail = await getJaegerTraceForOrg(orgId, traceId);
      if (!detail) return notFound(c, "Trace not found");
      return ok(c, detail);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Jaeger unavailable";
      return c.json({ error: message }, 503);
    }
  });
}
