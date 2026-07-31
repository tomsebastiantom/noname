import { PERMISSIONS } from "@noname/auth";
import { Hono } from "hono";
import { denyUnless } from "../../shared/deny-unless";
import { noContent, notFound, ok } from "../../shared/respond";
import { resolveSiteIdToOrgId } from "../../shared/site-id";
import type { TenantSettingsService } from "../documents";
import type { CatalogManifest, TenantCatalogService } from "./ports";

async function resolveTenantOrgId(
  tenantSettings: TenantSettingsService | undefined,
  siteId: string,
): Promise<string | null> {
  if (!tenantSettings) return siteId.trim() || null;
  return resolveSiteIdToOrgId(tenantSettings, siteId);
}

export function createTenantRoutes(
  service: TenantCatalogService,
  tenantSettings?: TenantSettingsService,
) {
  const routes = new Hono();

  routes.get("/resolve/:slug", async (c) => {
    if (!tenantSettings) {
      return c.json({ error: "Store slug resolution unavailable" }, 503);
    }
    const slug = c.req.param("slug");
    const orgId = await tenantSettings.resolveStoreSlug(slug);
    if (!orgId) return notFound(c);
    const settings = await tenantSettings.get(orgId);
    return ok(c, { orgId, slug: settings.slug ?? slug });
  });

  routes.get("/:id/catalog", async (c) => {
    const orgId = await resolveTenantOrgId(tenantSettings, c.req.param("id"));
    if (!orgId) return notFound(c);
    const manifest = await service.getManifest(orgId);
    return ok(c, manifest);
  });

  routes.put("/:id/catalog", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.TENANT_MANAGE);
    if (denied) return denied;
    const orgId = await resolveTenantOrgId(tenantSettings, c.req.param("id"));
    if (!orgId) return notFound(c);
    const body = await c.req.json<CatalogManifest>();

    if (!body?.platform?.version || !body?.platform?.hash) {
      return c.json({ error: "platform.version and platform.hash are required" }, 400);
    }

    await service.setManifest(orgId, body);
    return ok(c, body);
  });

  routes.post("/:id/components", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.TENANT_MANAGE);
    if (denied) return denied;
    const orgId = await resolveTenantOrgId(tenantSettings, c.req.param("id"));
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
    const orgId = await resolveTenantOrgId(tenantSettings, c.req.param("id"));
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
    const orgId = await resolveTenantOrgId(tenantSettings, c.req.param("id"));
    if (!orgId) return notFound(c);
    const name = c.req.param("name");

    await service.removeComponent(orgId, name);
    return noContent(c);
  });

  return routes;
}
