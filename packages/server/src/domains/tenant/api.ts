import { Hono } from "hono";
import type { TenantCatalogService } from "./ports";
import { ok, noContent } from "../../shared/respond";

export function createTenantRoutes(service: TenantCatalogService) {
  const routes = new Hono();

  routes.get("/:id/catalog", async (c) => {
    const tenantId = c.req.param("id");
    const manifest = await service.getManifest(tenantId);
    return ok(c, manifest);
  });

  routes.post("/:id/components", async (c) => {
    const tenantId = c.req.param("id");
    const body = await c.req.json<{ name: string; source: string }>();

    if (!body?.name || !body?.source) {
      return c.json({ error: "name and source are required" }, 400);
    }

    const { buildId } = await service.publishComponent(tenantId, body.name, body.source);
    return c.json({ data: { buildId, status: "pending" } }, 202);
  });

  routes.get("/:id/builds/:buildId", async (c) => {
    const tenantId = c.req.param("id");
    const buildId = c.req.param("buildId");

    const status = await service.getBuildStatus(tenantId, buildId);
    if (!status) {
      return c.json({ error: "build not found" }, 404);
    }

    return ok(c, status);
  });

  routes.delete("/:id/components/:name", async (c) => {
    const tenantId = c.req.param("id");
    const name = c.req.param("name");

    await service.removeComponent(tenantId, name);
    return noContent(c);
  });

  return routes;
}
