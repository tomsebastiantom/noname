import { Hono } from "hono";
import { created, ok } from "../../shared/respond";
import { getOrgId } from "../../shared/org";
import type { ContextEngine, ContextSignal } from "./ports";

export function createContextRoutes(engine: ContextEngine) {
  const routes = new Hono();

  routes.post("/resolve", async (c) => {
    const orgId = getOrgId(c);
    const signals = await c.req.json<ContextSignal[]>();
    const segment = await engine.resolve(signals, orgId);
    return created(c, segment);
  });

  routes.post("/segment-from-request", async (c) => {
    const orgId = getOrgId(c);
    const headers: Record<string, string> = {};
    c.req.raw.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });
    const segment = await engine.segmentForRequest(orgId, headers);
    return created(c, segment);
  });

  routes.get("/segments", async (c) => {
    const orgId = getOrgId(c);
    const segments = await engine.listSegments(orgId);
    return ok(c, segments);
  });

  return routes;
}
