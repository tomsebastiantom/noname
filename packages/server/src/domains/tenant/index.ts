import type { TenantSettingsService } from "../documents/ports";
import { createManifestStore } from "./adapters/manifest-store";
import { createCatalogBundleStorage, r2ConfigFromEnv } from "./adapters/r2";
import { createTenantRoutes } from "./api";
import type { ClientBundleResolver } from "./routes/deps";
import { createTenantCatalogService } from "./service";
import { startCatalogBuildWorker } from "./worker";

export interface TenantDomainDeps {
  tenantSettings?: TenantSettingsService;
  clientBundle?: ClientBundleResolver;
}

export function createTenantDomain(deps: TenantDomainDeps = {}) {
  const storage = createCatalogBundleStorage(r2ConfigFromEnv() ?? undefined);
  const manifestStore = createManifestStore();
  const service = createTenantCatalogService(manifestStore);
  const routes = createTenantRoutes(service, deps.tenantSettings, deps.clientBundle);
  const worker = startCatalogBuildWorker(storage, manifestStore);

  return { service, routes, worker };
}
