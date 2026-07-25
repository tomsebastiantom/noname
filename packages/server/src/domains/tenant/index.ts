import { createInMemoryManifestStore } from "./adapters/manifest-store";
import { createCatalogBundleStorage, r2ConfigFromEnv } from "./adapters/r2";
import { createTenantRoutes } from "./api";
import { createTenantCatalogService } from "./service";
import { startCatalogBuildWorker } from "./worker";

export function createTenantDomain() {
  const storage = createCatalogBundleStorage(r2ConfigFromEnv() ?? undefined);
  const manifestStore = createInMemoryManifestStore();
  const service = createTenantCatalogService(manifestStore);
  const routes = createTenantRoutes(service);
  const worker = startCatalogBuildWorker(storage, manifestStore);

  return { service, routes, worker };
}
