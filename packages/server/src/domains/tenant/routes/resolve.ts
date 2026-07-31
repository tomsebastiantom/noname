import type { Hono } from "hono";
import { notFound, ok } from "../../../shared/respond";
import type { TenantRouteDeps } from "./deps";

export function registerTenantResolveRoutes(routes: Hono, deps: TenantRouteDeps): void {
  routes.get("/resolve/:slug", async (c) => {
    if (!deps.tenantSettings) {
      return c.json({ error: "Store slug resolution unavailable" }, 503);
    }
    const slug = c.req.param("slug");
    const orgId = await deps.tenantSettings.resolveStoreSlug(slug);
    if (!orgId) return notFound(c);
    const settings = await deps.tenantSettings.get(orgId);
    return ok(c, { orgId, slug: settings.slug ?? slug });
  });
}
