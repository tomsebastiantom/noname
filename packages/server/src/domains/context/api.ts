import { Hono } from "hono";
import type { ContextEngine, ContextSignal } from "./ports";
import { getTenantId } from "../../shared/tenant";
import { ok, created } from "../../shared/respond";

export function createContextRoutes(engine: ContextEngine) {
  const routes = new Hono();

  routes.post("/resolve", async (c) => {
    const tenantId = getTenantId(c);
    const signals = await c.req.json<ContextSignal[]>();
    const segment = await engine.resolve(signals, tenantId);
    return created(c, segment);
  });

  routes.post("/segment-from-request", async (c) => {
    const tenantId = getTenantId(c);
    const headers: Record<string, string> = {};
    c.req.raw.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    const segment = await engine.segmentForRequest(tenantId, headers);
    return created(c, segment);
  });

  routes.get("/segments", async (c) => {
    const tenantId = getTenantId(c);
    const segments = await engine.listSegments(tenantId);
    return ok(c, segments);
  });

  return routes;
}
