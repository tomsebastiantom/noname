import { flushEvents } from "../../../shared/aggregate-root";
import { NotFoundError, ValidationError } from "../../../shared/domain-error";
import { ContentDocument } from "../entity";
import type { ContentDocumentService, DocumentStorage } from "../ports";
import { contentValidator } from "../validation/validator";
import { DEFAULT_DEFAULT_LOCALE, DEFAULT_LOCALES } from "./constants";
import {
  assertDocumentRefs,
  buildContentData,
  filterReadFields,
  validateFieldWritePermissions,
} from "./helpers";

export interface ContentServiceOptions {
  onContentPublished?: (orgId: string, type: string, id: string) => Promise<void>;
}

export function createContentService(
  storage: DocumentStorage,
  validator: typeof contentValidator = contentValidator,
  options: ContentServiceOptions = {},
): ContentDocumentService {
  return {
    async create(orgId, type, data, opts) {
      const locale = opts?.locale;
      const role = opts?.role;
      const schema = await storage.findContentTypeByName(orgId, type);
      if (!schema) throw new NotFoundError("ContentType", type);

      validateFieldWritePermissions(schema.schema.fields, data, role);

      const ts = await storage.getTenantSettings(orgId);
      const locales = ts?.locales ?? DEFAULT_LOCALES;
      const defaultLocale = ts?.defaultLocale ?? DEFAULT_DEFAULT_LOCALE;

      const built = buildContentData(schema.schema, data, undefined, locale, true, defaultLocale);
      if (built.errors.length) throw new ValidationError(type, built.errors.join("; "));

      await assertDocumentRefs(storage, schema.schema, built.data!, orgId);

      const v = validator.validate(schema.schema, built.data!, locales);
      if (!v.valid) throw new ValidationError(type, v.errors?.join("; ") || "invalid");

      const entity = ContentDocument.create(orgId, type, built.data!);
      const saved = await storage.createDocument({
        orgId,
        type,
        key: entity.id,
        data: entity.data,
        status: "draft",
      });
      flushEvents(entity);
      return saved;
    },

    findByType: async (orgId, type) => {
      const rows = await storage.listDocuments(orgId, { type });
      return rows;
    },

    findById: async (_orgId, id, opts) => {
      const found = await storage.findDocumentById(id);
      if (!found) return null;
      const schema = await storage.findContentTypeByName(_orgId, found.type);
      if (!schema) return found;
      return filterReadFields(found, schema.schema.fields, opts?.role);
    },

    async updateById(orgId, type, id, data, opts) {
      const locale = opts?.locale;
      const role = opts?.role;
      const schema = await storage.findContentTypeByName(orgId, type);
      if (!schema) throw new NotFoundError("ContentType", type);
      const existing = await storage.findDocumentById(id);
      if (!existing || existing.type !== type)
        throw new NotFoundError("ContentEntry", `${type}/${id}`);

      validateFieldWritePermissions(schema.schema.fields, data, role);

      const ts = await storage.getTenantSettings(orgId);
      const locales = ts?.locales ?? DEFAULT_LOCALES;
      const defaultLocale = ts?.defaultLocale ?? DEFAULT_DEFAULT_LOCALE;

      const built = buildContentData(
        schema.schema,
        data,
        existing.data,
        locale,
        false,
        defaultLocale,
      );
      if (built.errors.length) throw new ValidationError(type, built.errors.join("; "));

      await assertDocumentRefs(storage, schema.schema, built.data!, orgId);

      const v = validator.validate(schema.schema, built.data!, locales);
      if (!v.valid) throw new ValidationError(type, v.errors?.join("; ") || "invalid");

      const updated = await storage.updateDocument(existing.id, built.data!);
      const entity = new ContentDocument(existing.id, orgId, type, updated.data, "draft");
      entity.update(updated.data);
      flushEvents(entity);
      return updated;
    },

    async deleteById(orgId, type, id) {
      const existing = await storage.findDocumentById(id);
      if (!existing || existing.type !== type)
        throw new NotFoundError("ContentEntry", `${type}/${id}`);
      const entity = new ContentDocument(existing.id, orgId, type, existing.data, existing.status);
      entity.deleteEntry();
      await storage.deleteDocument(existing.id);
      flushEvents(entity);
    },

    async publish(orgId, type, id) {
      const existing = await storage.findDocumentById(id);
      if (!existing || existing.type !== type)
        throw new NotFoundError("ContentEntry", `${type}/${id}`);
      const published = await storage.publishDocument(existing.id);
      const entity = new ContentDocument(existing.id, orgId, type, existing.data, "draft");
      entity.publish();
      flushEvents(entity);
      if (options.onContentPublished) {
        await options.onContentPublished(orgId, type, id);
      }
      return published;
    },

    async resolve(orgId, type, id, locale) {
      const existing = await storage.findDocumentById(id);
      if (!existing || existing.type !== type) return null;
      const schema = await storage.findContentTypeByName(orgId, type);
      const ts = await storage.getTenantSettings(orgId);
      const defaultLocale = ts?.defaultLocale ?? DEFAULT_DEFAULT_LOCALE;

      const resolved: Record<string, unknown> = {};
      if (!schema) return existing.data;

      for (const field of schema.schema.fields) {
        const value = existing.data[field.key];
        if (value === undefined) continue;
        if (field.isLocalizable && value && typeof value === "object" && !Array.isArray(value)) {
          const map = value as Record<string, unknown>;
          const picked =
            locale in map
              ? map[locale]
              : defaultLocale in map
                ? map[defaultLocale]
                : Object.values(map)[0];
          resolved[field.key] = picked;
        } else {
          resolved[field.key] = value;
        }
      }
      return resolved;
    },
  };
}
