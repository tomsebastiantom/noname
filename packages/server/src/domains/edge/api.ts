import { Hono } from "hono";
import { ok } from "../../shared/respond";
import { getOrgId, resolveOrgId } from "../../shared/org";
import type { EdgeService } from "./ports";

export function createEdgeRoutes(service: EdgeService) {
  const routes = new Hono();

  routes.get("/schema/:siteId", async (c) => {
    const orgId = resolveOrgId(c, c.req.param("siteId"));
    const segment = c.req.query("segment") || "default";
    const template = c.req.query("template") || "home";
    const schema = await service.getSchema(orgId, segment, template);
    return ok(c, schema);
  });

  routes.post("/personalize", async (c) => {
    const orgId = getOrgId(c);
    const body = await c.req.json();
    const result = await service.personalize(orgId, body);
    return ok(c, result);
  });

  return routes;
}
