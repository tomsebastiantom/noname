import type { TenantSettingsService } from "../documents";
import { createManifestStore } from "./adapters/manifest-store";
import { createCatalogBundleStorage, r2ConfigFromEnv } from "./adapters/r2";
import { createTenantRoutes } from "./api";
import { createTenantCatalogService } from "./service";
import { startCatalogBuildWorker } from "./worker";

export interface TenantDomainDeps {
  tenantSettings?: TenantSettingsService;
}

export function createTenantDomain(deps: TenantDomainDeps = {}) {
  const storage = createCatalogBundleStorage(r2ConfigFromEnv() ?? undefined);
  const manifestStore = createManifestStore();
  const service = createTenantCatalogService(manifestStore);
  const routes = createTenantRoutes(service, deps.tenantSettings);
  const worker = startCatalogBuildWorker(storage, manifestStore);

  return { service, routes, worker };
}
