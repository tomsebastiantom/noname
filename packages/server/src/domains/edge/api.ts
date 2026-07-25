import { Hono } from "hono";
import { getOrgId, resolveOrgId } from "../../shared/org";
import { ok } from "../../shared/respond";
import type { EdgeService } from "./ports";

export function createEdgeRoutes(service: EdgeService) {
  const routes = new Hono();

  routes.get("/schema/:siteId", async (c) => {
    const orgId = resolveOrgId(c, c.req.param("siteId"));
    const schema = await service.getSchema(orgId, {
      segment: c.req.query("segment") || "default",
      template: c.req.query("template") || "home",
      contentRef: c.req.query("contentRef") ?? undefined,
      locale: c.req.query("locale") ?? undefined,
    });
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
