import { Hono } from "hono";
import type { TenantSettingsService } from "../documents/ports";
import type { TenantCatalogService } from "./ports";
import { registerTenantCatalogRoutes } from "./routes/catalog";
import { registerTenantComponentRoutes } from "./routes/components";
import type { TenantRouteDeps } from "./routes/deps";
import { registerTenantResolveRoutes } from "./routes/resolve";

export function createTenantRoutes(
  service: TenantCatalogService,
  tenantSettings?: TenantSettingsService,
) {
  const routes = new Hono();
  const deps: TenantRouteDeps = { service, tenantSettings };

  registerTenantResolveRoutes(routes, deps);
  registerTenantCatalogRoutes(routes, deps);
  registerTenantComponentRoutes(routes, deps);

  return routes;
}
