import { Hono } from "hono";
import { ok } from "../../shared/respond";
import { getTenantId } from "../../shared/tenant";
import type { EdgeService } from "./ports";

export function createEdgeRoutes(service: EdgeService) {
  const routes = new Hono();

  routes.get("/schema/:siteId", async (c) => {
    const siteId = c.req.param("siteId");
    const segment = c.req.query("segment") || "default";
    const schema = await service.getSchema(siteId, segment);
    return ok(c, schema);
  });

  routes.post("/personalize", async (c) => {
    const tenantId = getTenantId(c);
    const body = await c.req.json();
    const result = await service.personalize(tenantId, body);
    return ok(c, result);
  });

  return routes;
}
