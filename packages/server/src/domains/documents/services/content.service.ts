import { flushEvents } from "../../../shared/aggregate-root";
import { recordDocumentOp } from "../../../shared/document-audit";
import { ContentDocument } from "../entity";
import {
  buildDataPatchPayload,
  type DocumentOpPayload,
} from "../document-op-payload";
import type { ContentDocumentService, DocumentStorage } from "../ports";
import { extractCollectionFromBody } from "../shared/document-collection";
import { pickLocalizedValue, resolveTenantLocales } from "../shared/locale";
import { contentValidator } from "../validation/validator";
import { filterReadFields, prepareContentWrite } from "./content-write";
import { requireContentEntry } from "./document-guards";

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
      const { collectionId, data: contentData } = extractCollectionFromBody(data);
      const { data: builtData } = await prepareContentWrite(
        storage,
        validator,
        orgId,
        type,
        contentData,
        {
          locale: opts?.locale,
          role: opts?.role,
          isCreate: true,
        },
      );

      const audit = opts?.audit;
      const entity = ContentDocument.create(orgId, type, builtData, audit);
      const saved = await storage.createDocument({
        orgId,
        type,
        key: entity.id,
        data: entity.data,
        status: "draft",
        collectionId,
      });
      flushEvents(entity);
      if (audit) {
        await recordDocumentOp(storage, {
          orgId,
          documentId: saved.id,
          operation: "create",
          audit,
          payload: buildDataPatchPayload(undefined, builtData),
        });
      }
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
      const existing = await requireContentEntry(storage, orgId, type, id);
      const { collectionId, data: contentData } = extractCollectionFromBody(data);

      const { data: builtData } = await prepareContentWrite(
        storage,
        validator,
        orgId,
        type,
        contentData,
        {
          locale: opts?.locale,
          role: opts?.role,
          existingData: existing.data,
          isCreate: false,
        },
      );

      const audit = opts?.audit;
      const updated = await storage.updateDocument(
        existing.id,
        builtData,
        undefined,
        collectionId !== undefined ? collectionId : undefined,
      );
      const entity = new ContentDocument(existing.id, orgId, type, updated.data, "draft");
      entity.update(updated.data, audit);
      flushEvents(entity);
      if (audit) {
        await recordDocumentOp(storage, {
          orgId,
          documentId: updated.id,
          operation: "update",
          audit,
          payload: buildDataPatchPayload(
            existing.data as Record<string, unknown>,
            builtData,
            existing.updatedAt.toISOString(),
          ),
          clientId: opts?.clientId,
          clientSeq: opts?.clientSeq,
        });
      }
      return updated;
    },

    async deleteById(orgId, type, id, audit) {
      const existing = await requireContentEntry(storage, orgId, type, id);
      const entity = new ContentDocument(existing.id, orgId, type, existing.data, existing.status);
      entity.deleteEntry(audit);
      await storage.deleteDocument(existing.id);
      flushEvents(entity);
      if (audit) {
        await recordDocumentOp(storage, {
          orgId,
          documentId: existing.id,
          operation: "delete",
          audit,
          payload: { opType: "lifecycle", action: "delete" } satisfies DocumentOpPayload,
        });
      }
    },

    async publish(orgId, type, id, audit) {
      const existing = await requireContentEntry(storage, orgId, type, id);
      const published = await storage.publishDocument(existing.id);
      const entity = new ContentDocument(existing.id, orgId, type, existing.data, "draft");
      entity.publish(audit);
      flushEvents(entity);
      if (audit) {
        await recordDocumentOp(storage, {
          orgId,
          documentId: existing.id,
          operation: "publish",
          audit,
          payload: { opType: "lifecycle", action: "publish" } satisfies DocumentOpPayload,
        });
      }
      if (options.onContentPublished) {
        await options.onContentPublished(orgId, type, id);
      }
      return published;
    },

    async resolve(orgId, type, id, locale) {
      const existing = await storage.findDocumentById(id);
      if (!existing || existing.type !== type) return null;
      const schema = await storage.findContentTypeByName(orgId, type);
      const { defaultLocale } = await resolveTenantLocales(storage, orgId);

      const resolved: Record<string, unknown> = {};
      if (!schema) return existing.data;

      for (const field of schema.schema.fields) {
        const value = existing.data[field.key];
        if (value === undefined) continue;
        if (field.isLocalizable && value && typeof value === "object" && !Array.isArray(value)) {
          resolved[field.key] = pickLocalizedValue(value, locale, defaultLocale);
        } else {
          resolved[field.key] = value;
        }
      }
      return resolved;
    },
  };
}
