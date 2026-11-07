import { Hono } from "hono";
import type { TenantSettingsService } from "../documents/ports";
import type { TenantCatalogService } from "./ports";
import { registerTenantCatalogRoutes } from "./routes/catalog";
import { registerTenantComponentRoutes } from "./routes/components";
import type { ClientBundleResolver, TenantRouteDeps } from "./routes/deps";
import { registerTenantPublishableKeyRoutes } from "./routes/publishable-key";
import { registerTenantResolveRoutes } from "./routes/resolve";

export function createTenantRoutes(
  service: TenantCatalogService,
  tenantSettings?: TenantSettingsService,
  clientBundle?: ClientBundleResolver,
) {
  const routes = new Hono();
  const deps: TenantRouteDeps = { service, tenantSettings, clientBundle };

  registerTenantResolveRoutes(routes, deps);
  registerTenantCatalogRoutes(routes, deps);
  registerTenantComponentRoutes(routes, deps);
  registerTenantPublishableKeyRoutes(routes, deps);

  return routes;
}
