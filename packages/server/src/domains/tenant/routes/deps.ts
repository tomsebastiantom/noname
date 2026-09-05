import type { TenantSettingsService } from "../../documents/ports";
import type { TenantCatalogService } from "../ports";

export interface TenantRouteDeps {
  service: TenantCatalogService;
  tenantSettings?: TenantSettingsService;
}
