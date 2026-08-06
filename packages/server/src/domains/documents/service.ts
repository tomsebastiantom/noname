import type { DocumentService, DocumentStorage } from "./ports";
import { findInboundRefs as collectInboundRefs } from "./refs/inbound";
import { resolveDocumentRefs } from "./refs/resolve";
import { createAssetsService } from "./services/assets.service";
import { DEFAULT_DEFAULT_LOCALE } from "./services/constants";
import { createContentService } from "./services/content.service";
import { createContentTypesService } from "./services/content-types.service";
import { createLayoutService } from "./services/layouts.service";
import { createPagesService, normalizeRoutePath } from "./services/pages.service";
import { createTenantSettingsService } from "./services/tenant-settings.service";
import { contentValidator } from "./validation/validator";

export { normalizeRoutePath };

export interface DocumentsServiceOptions {
  onContentPublished?: (orgId: string, type: string, id: string) => Promise<void>;
}

export function createDocumentsService(
  storage: DocumentStorage,
  validator: typeof contentValidator = contentValidator,
  options: DocumentsServiceOptions = {},
): DocumentService {
  const contentTypes = createContentTypesService(storage);
  const tenantSettings = createTenantSettingsService(storage);
  const assets = createAssetsService(storage);
  const content = createContentService(storage, validator, {
    ...options,
    getAsset: (orgId, documentId) => assets.get(orgId, documentId),
  });
  const layout = createLayoutService(storage);
  const pages = createPagesService(storage);

  return {
    contentTypes,
    tenantSettings,
    content,
    layout,
    assets,
    pages,
    async resolveRefs(orgId, ids, locale) {
      const ts = await storage.getTenantSettings(orgId);
      const defaultLocale = ts?.defaultLocale ?? DEFAULT_DEFAULT_LOCALE;
      const resolvedLocale = locale?.trim() || defaultLocale;
      return resolveDocumentRefs(
        storage,
        orgId,
        ids,
        resolvedLocale,
        defaultLocale,
        (oid, documentId) => assets.get(oid, documentId),
      );
    },

    async findInboundRefs(orgId, documentId) {
      const trimmed = documentId.trim();
      if (!trimmed) return [];
      const candidates = await storage.findDocumentsWithDataMentioning(orgId, trimmed);
      return collectInboundRefs(candidates, trimmed);
    },
  };
}
