import { normalizeStoreSlug } from "@noname/shared";
import type { TenantSettingsService } from "../domains/documents/ports";

/**
 * Reserved slug for the platform operator surface (`platform.localhost`).
 *
 * The console is **not** a tenant: it has no settings document, no layout of its own beside the admin one, and its
 * users belong to the platform org. Mapping the slug straight to `PLATFORM_ORG_ID` keeps that honest — before this,
 * reaching it required hand-inserting a `tenant_settings` row, which made a platform surface look like customer data.
 *
 * A tenant may never take this slug; `POST /api/platform/tenants` rejects it.
 */
export const PLATFORM_HOST_SLUG = "platform";

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

  const slug = normalizeStoreSlug(trimmed);
  if (slug === PLATFORM_HOST_SLUG) {
    return process.env.PLATFORM_ORG_ID?.trim() || null;
  }

  return tenantSettings.resolveStoreSlug(slug);
}
