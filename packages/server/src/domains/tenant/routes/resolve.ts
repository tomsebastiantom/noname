import type { Hono } from "hono";
import { notFound, ok } from "../../../shared/respond";
import { PLATFORM_HOST_SLUG } from "../../../shared/site-id";
import type { TenantRouteDeps } from "./deps";

export function registerTenantResolveRoutes(routes: Hono, deps: TenantRouteDeps): void {
  routes.get("/resolve/:slug", async (c) => {
    if (!deps.tenantSettings) {
      return c.json({ error: "Store slug resolution unavailable" }, 503);
    }
    const slug = c.req.param("slug");

    // The operator surface is not a tenant: it resolves from configuration, never from a settings document.
    if (slug === PLATFORM_HOST_SLUG) {
      const platformOrgId = process.env.PLATFORM_ORG_ID?.trim();
      if (!platformOrgId) return notFound(c);
      return ok(c, { orgId: platformOrgId, slug: PLATFORM_HOST_SLUG, platform: true });
    }

    const orgId = await deps.tenantSettings.resolveStoreSlug(slug);
    if (!orgId) return notFound(c);
    const settings = await deps.tenantSettings.get(orgId);
    return ok(c, { orgId, slug: settings.slug ?? slug });
  });
}
