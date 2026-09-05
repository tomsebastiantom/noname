import { Hono } from "hono";
import { getOrgId } from "../../shared/org";
import { notFound, ok } from "../../shared/respond";
import { resolveSiteIdToOrgId } from "../../shared/site-id";
import type { TenantSettingsService } from "../documents/ports";
import type { EdgeService } from "./ports";

export function createEdgeRoutes(service: EdgeService, tenantSettings: TenantSettingsService) {
  const routes = new Hono();

  routes.get("/schema/:siteId", async (c) => {
    const siteId = c.req.param("siteId");
    const orgId = getOrgId(c) || (await resolveSiteIdToOrgId(tenantSettings, siteId));
    if (!orgId) return notFound(c);

    const schema = await service.getSchema(orgId, {
      segment: c.req.query("segment") || "default",
      template: c.req.query("template") || undefined,
      url: c.req.query("url") ?? undefined,
      contentRef: c.req.query("contentRef") ?? undefined,
      locale: c.req.query("locale") ?? undefined,
      edit: c.req.query("edit") === "true",
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
