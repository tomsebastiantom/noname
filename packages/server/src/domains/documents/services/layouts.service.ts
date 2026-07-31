import { flushEvents } from "../../../shared/aggregate-root";
import { ValidationError } from "../../../shared/domain-error";
import { LayoutDocument } from "../entity";
import { applyOverrides, deepClone } from "../merge";
import type { DocumentStorage, LayoutDocumentService, LayoutDTO } from "../ports";
import { isPublished } from "../shared/document-status";
import { requireLayoutDocument, requirePublishedLayout } from "./document-guards";
import {
  readContentRef,
  toLayoutEntity,
  validateSpec,
  validateTemplateName,
} from "./layout-helpers";

export function createLayoutService(storage: DocumentStorage): LayoutDocumentService {
  return {
    async create(orgId, input) {
      validateTemplateName(input.templateName);
      validateSpec(input.spec);

      const entity = LayoutDocument.create(
        orgId,
        input.templateName,
        input.segment || "default",
        input.spec,
        1,
        null,
      );
      const saved = await storage.createDocument({
        orgId,
        type: "layout",
        key: entity.templateName,
        segment: entity.segment,
        data: { spec: entity.spec },
        baseVersion: null,
        status: "draft",
      });
      flushEvents(entity);
      return saved as unknown as LayoutDTO;
    },

    async update(orgId, id, input) {
      const existing = await requireLayoutDocument(storage, id, orgId);
      validateSpec(input.spec);

      const entity = toLayoutEntity(existing as LayoutDTO);
      entity.update(input.spec);
      const nextData: Record<string, unknown> = { ...existing.data, spec: input.spec };
      if (input.contentRef !== undefined) {
        if (input.contentRef === null) {
          delete nextData.contentRef;
        } else {
          nextData.contentRef = input.contentRef;
        }
      }
      const updated = await storage.updateDocument(id, nextData, existing.meta);
      flushEvents(entity);
      return updated as unknown as LayoutDTO;
    },

    async addVariant(orgId, templateName, segment, overrides) {
      validateTemplateName(templateName);
      if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
        throw new ValidationError("overrides", "overrides must be an object of dot-path keys");
      }

      const publishedDefault = await requirePublishedLayout(
        storage,
        orgId,
        templateName,
        "default",
      );
      const baseVersion = publishedDefault.version;

      const saved = await storage.createDocument({
        orgId,
        type: "layout",
        key: templateName,
        segment,
        data: { overrides, baseVersion },
        baseVersion,
        status: "draft",
      });
      const entity = toLayoutEntity(saved as LayoutDTO);
      entity.recordVariantCreated();
      flushEvents(entity);
      return saved as unknown as LayoutDTO;
    },

    async publish(orgId, id) {
      const existing = await requireLayoutDocument(storage, id, orgId);
      const entity = toLayoutEntity(existing as LayoutDTO);
      entity.publish();
      const updated = await storage.publishDocument(id);
      flushEvents(entity);
      return updated as unknown as LayoutDTO;
    },

    async archive(orgId, id) {
      const existing = await requireLayoutDocument(storage, id, orgId);
      const entity = toLayoutEntity(existing as LayoutDTO);
      entity.archive();
      const updated = await storage.archiveDocument(id);
      flushEvents(entity);
      return updated as unknown as LayoutDTO;
    },

    list: (orgId, filters) =>
      storage.listDocuments(orgId, {
        type: "layout",
        key: filters?.templateName,
        segment: filters?.segment,
        status: filters?.status,
      }) as unknown as Promise<LayoutDTO[]>,

    get: async (orgId, id) => {
      const found = await storage.findDocumentById(id);
      if (found?.type !== "layout" || found.orgId !== orgId) return null;
      return found as LayoutDTO;
    },

    async resolve(orgId, templateName, segment) {
      const publishedDefault = await storage.findDocument(orgId, "layout", templateName, "default");
      if (!publishedDefault || !isPublished(publishedDefault)) return null;
      const defaultSpec = (publishedDefault.data.spec as Record<string, unknown>) ?? {};

      if (segment === "default") {
        return {
          templateName,
          segment: "default",
          version: publishedDefault.version,
          spec: deepClone(defaultSpec),
          contentRef: readContentRef(publishedDefault.data),
          conflicts: [],
        };
      }

      const variant = await storage.findDocument(orgId, "layout", templateName, segment);
      if (!variant || !isPublished(variant)) {
        return {
          templateName,
          segment: "default",
          version: publishedDefault.version,
          spec: deepClone(defaultSpec),
          contentRef: readContentRef(publishedDefault.data),
          conflicts: [],
        };
      }

      const overrides = (variant.data.overrides as Record<string, unknown>) ?? {};
      const { spec, conflicts } = applyOverrides(defaultSpec, overrides);
      return {
        templateName,
        segment,
        version: publishedDefault.version,
        spec,
        contentRef: readContentRef(publishedDefault.data),
        conflicts,
      };
    },
  };
}
