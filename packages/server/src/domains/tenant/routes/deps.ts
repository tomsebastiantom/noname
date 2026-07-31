import type { TenantSettingsService } from "../../documents/contracts";
import type { TenantCatalogService } from "../ports";

export interface TenantRouteDeps {
  service: TenantCatalogService;
  tenantSettings?: TenantSettingsService;
}
