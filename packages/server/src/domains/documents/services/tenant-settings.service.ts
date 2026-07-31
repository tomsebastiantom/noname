import { ValidationError } from "../../../shared/domain-error";
import { assertValidStoreSlug, normalizeStoreSlug } from "../../../shared/store-slug";
import type { DocumentStorage, TenantSettingsService } from "../ports";
import { defaultTenantSettings } from "./tenant-defaults";

export function createTenantSettingsService(storage: DocumentStorage): TenantSettingsService {
  return {
    async get(orgId) {
      const existing = await storage.getTenantSettings(orgId);
      if (existing) return existing;
      return storage.upsertTenantSettings(orgId, defaultTenantSettings());
    },
    async upsert(orgId, data) {
      const nextSlug = data.slug == null ? null : normalizeStoreSlug(data.slug);
      if (nextSlug) {
        assertValidStoreSlug(nextSlug);
        const owner = await storage.findOrgIdByStoreSlug(nextSlug);
        if (owner && owner !== orgId) {
          throw new ValidationError(
            "tenant_settings",
            `Store slug "${nextSlug}" is already in use`,
          );
        }
      }
      return storage.upsertTenantSettings(orgId, { ...data, slug: nextSlug });
    },
    resolveStoreSlug: (slug) => storage.findOrgIdByStoreSlug(normalizeStoreSlug(slug)),
  };
}
