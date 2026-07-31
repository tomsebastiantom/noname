import { PERMISSIONS } from "@noname/auth";
import type { Hono } from "hono";
import { noContent, notFound, ok } from "../../../shared/respond";
import { resolveRouteOrgId } from "../../../shared/site-id";
import { denyUnless } from "../../auth/deny-unless";
import type { TenantRouteDeps } from "./deps";

export function registerTenantComponentRoutes(routes: Hono, deps: TenantRouteDeps): void {
  const { service, tenantSettings } = deps;

  routes.post("/:id/components", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.TENANT_MANAGE);
    if (denied) return denied;
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("id"));
    if (!orgId) return notFound(c);
    const body = await c.req.json<{ name: string; source: string }>();

    if (!body?.name || !body?.source) {
      return c.json({ error: "name and source are required" }, 400);
    }

    const { buildId } = await service.publishComponent(orgId, body.name, body.source);
    return c.json({ data: { buildId, status: "pending" } }, 202);
  });

  routes.get("/:id/builds/:buildId", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.TENANT_MANAGE);
    if (denied) return denied;
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("id"));
    if (!orgId) return notFound(c);
    const buildId = c.req.param("buildId");

    const status = await service.getBuildStatus(orgId, buildId);
    if (!status) {
      return c.json({ error: "build not found" }, 404);
    }

    return ok(c, status);
  });

  routes.delete("/:id/components/:name", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.TENANT_MANAGE);
    if (denied) return denied;
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("id"));
    if (!orgId) return notFound(c);
    const name = c.req.param("name");

    await service.removeComponent(orgId, name);
    return noContent(c);
  });
}
