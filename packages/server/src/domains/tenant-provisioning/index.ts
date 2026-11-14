import type { Database } from "../../drizzle";
import { createTenantProvisioningStore } from "./adapters/postgres";
import { createTenantProvisioningRoutes } from "./api";
import type { ProvisioningService } from "./ports";
import type { DirectoryPort } from "./service";
import { createTenantProvisioningService } from "./service";

export type { ProvisioningRecord, ProvisioningStore } from "./ports";
export { PROVISIONING_STATES, type ProvisioningState } from "./schema";

export function createTenantProvisioningDomain(deps: { db: Database; directory: DirectoryPort }) {
  const store = createTenantProvisioningStore(deps.db);
  const service: ProvisioningService = createTenantProvisioningService(store, deps.directory);
  return { store, service, routes: createTenantProvisioningRoutes(service) };
}
