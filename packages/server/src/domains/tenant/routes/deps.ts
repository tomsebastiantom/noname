import type { TenantSettingsService } from "../../documents/ports";
import type { TenantCatalogService } from "../ports";

/** Resolves the client bundle URL a tenant should load (D1 C1). Null means “keep the stored manifest”. */
export type ClientBundleResolver = (
  orgId: string,
) => Promise<{ url: string; hash: string; version: string } | null>;

export interface TenantRouteDeps {
  service: TenantCatalogService;
  tenantSettings?: TenantSettingsService;
  clientBundle?: ClientBundleResolver;
}
