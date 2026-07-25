import { Hono } from "hono";
import { resolveOrgId } from "../../shared/org";
import { noContent, ok } from "../../shared/respond";
import type { TenantCatalogService } from "./ports";

export function createTenantRoutes(service: TenantCatalogService) {
  const routes = new Hono();

  routes.get("/:id/catalog", async (c) => {
    const orgId = resolveOrgId(c, c.req.param("id"));
    const manifest = await service.getManifest(orgId);
    return ok(c, manifest);
  });

  routes.post("/:id/components", async (c) => {
    const orgId = c.req.param("id");
    const body = await c.req.json<{ name: string; source: string }>();

    if (!body?.name || !body?.source) {
      return c.json({ error: "name and source are required" }, 400);
    }

    const { buildId } = await service.publishComponent(orgId, body.name, body.source);
    return c.json({ data: { buildId, status: "pending" } }, 202);
  });

  routes.get("/:id/builds/:buildId", async (c) => {
    const orgId = c.req.param("id");
    const buildId = c.req.param("buildId");

    const status = await service.getBuildStatus(orgId, buildId);
    if (!status) {
      return c.json({ error: "build not found" }, 404);
    }

    return ok(c, status);
  });

  routes.delete("/:id/components/:name", async (c) => {
    const orgId = c.req.param("id");
    const name = c.req.param("name");

    await service.removeComponent(orgId, name);
    return noContent(c);
  });

  return routes;
}
