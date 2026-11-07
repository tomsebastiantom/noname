import type { CapabilityRegistry } from "../capabilities/registry";
import type { TenantCatalogService } from "../tenant/ports";
import { createEvalRoutes } from "./api";

export function createEvalDomain(deps: {
  capabilities: CapabilityRegistry;
  tenants: Pick<TenantCatalogService, "getManifest">;
}) {
  return {
    routes: createEvalRoutes(deps),
  };
}
