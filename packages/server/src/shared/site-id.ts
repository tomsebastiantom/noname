import type { TenantSettingsService } from "../domains/documents/ports";
import { normalizeStoreSlug } from "./store-slug";

/** Resolve API path segment (store slug) to org id. */
export async function resolveSiteIdToOrgId(
  tenantSettings: TenantSettingsService,
  siteId: string,
): Promise<string | null> {
  const trimmed = siteId.trim();
  if (!trimmed) return null;
  return tenantSettings.resolveStoreSlug(normalizeStoreSlug(trimmed));
}
