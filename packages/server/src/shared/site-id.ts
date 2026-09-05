import { normalizeStoreSlug } from "@noname/shared";
import type { TenantSettingsService } from "../domains/documents/ports";

/** Resolve route param (store slug or raw org id when tenant settings unavailable). */
export async function resolveRouteOrgId(
  tenantSettings: TenantSettingsService | undefined,
  siteId: string,
): Promise<string | null> {
  if (!tenantSettings) return siteId.trim() || null;
  return resolveSiteIdToOrgId(tenantSettings, siteId);
}

/** Resolve API path segment (store slug) to org id. */
export async function resolveSiteIdToOrgId(
  tenantSettings: TenantSettingsService,
  siteId: string,
): Promise<string | null> {
  const trimmed = siteId.trim();
  if (!trimmed) return null;

  return tenantSettings.resolveStoreSlug(normalizeStoreSlug(trimmed));
}
