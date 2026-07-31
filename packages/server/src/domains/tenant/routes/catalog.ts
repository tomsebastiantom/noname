import { PERMISSIONS } from "@noname/auth";
import type { Hono } from "hono";
import { notFound, ok } from "../../../shared/respond";
import { resolveRouteOrgId } from "../../../shared/site-id";
import { denyUnless } from "../../auth/deny-unless";
import type { CatalogManifest } from "../ports";
import type { TenantRouteDeps } from "./deps";

export function registerTenantCatalogRoutes(routes: Hono, deps: TenantRouteDeps): void {
  const { service, tenantSettings } = deps;

  routes.get("/:id/catalog", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("id"));
    if (!orgId) return notFound(c);
    const manifest = await service.getManifest(orgId);
    return ok(c, manifest);
  });

  routes.put("/:id/catalog", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.TENANT_MANAGE);
    if (denied) return denied;
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("id"));
    if (!orgId) return notFound(c);
    const body = await c.req.json<CatalogManifest>();

    if (!body?.platform?.version || !body?.platform?.hash) {
      return c.json({ error: "platform.version and platform.hash are required" }, 400);
    }

    await service.setManifest(orgId, body);
    return ok(c, body);
  });
}
