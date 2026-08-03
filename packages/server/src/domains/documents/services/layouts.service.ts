import { flushEvents } from "../../../shared/aggregate-root";
import { ConflictError, ValidationError } from "../../../shared/domain-error";
import { LayoutDocument } from "../entity";
import { applyOverrides, deepClone } from "../merge";
import type { DocumentStorage, LayoutDocumentService, LayoutDTO } from "../ports";
import { isPublished } from "../shared/document-status";
import { normalizeTags } from "../shared/document-tags";
import { requireLayoutDocument, requirePublishedLayout } from "./document-guards";
import {
  readContentRef,
  readRenderAs,
  readShellRef,
  toLayoutEntity,
  validateLayoutMetadata,
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
      const data: Record<string, unknown> = { spec: entity.spec };
      if (input.renderAs) {
        data.renderAs = input.renderAs;
      }
      if (input.shellRef) {
        data.shellRef = input.shellRef;
      }
      validateLayoutMetadata(data);

      const saved = await storage.createDocument({
        orgId,
        type: "layout",
        key: entity.templateName,
        segment: entity.segment,
        data,
        baseVersion: null,
        status: "draft",
        tags: normalizeTags(input.tags),
      });
      flushEvents(entity);
      return saved as unknown as LayoutDTO;
    },

    async update(orgId, id, input, options) {
      const existing = await requireLayoutDocument(storage, id, orgId);
      if (options?.ifMatchUpdatedAt) {
        const expected = options.ifMatchUpdatedAt.replace(/^W\//, "").replace(/^"|"$/g, "");
        const actual = existing.updatedAt.toISOString();
        if (expected !== actual && expected !== String(existing.updatedAt.getTime())) {
          throw new ConflictError("Someone else saved this layout — refresh to see their changes", {
            id,
            updatedAt: actual,
          });
        }
      }
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
      if (input.renderAs !== undefined) {
        nextData.renderAs = input.renderAs;
      }
      if (input.shellRef !== undefined) {
        if (input.shellRef === null) {
          delete nextData.shellRef;
        } else {
          nextData.shellRef = input.shellRef;
        }
      }
      validateLayoutMetadata(nextData);
      const nextTags = input.tags !== undefined ? normalizeTags(input.tags) : undefined;
      const updated = await storage.updateDocument(id, nextData, existing.meta, nextTags);
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

      const merged = applyOverrides(
        deepClone(publishedDefault.data.spec as Record<string, unknown>),
        overrides,
      );

      const entity = LayoutDocument.create(
        orgId,
        templateName,
        segment,
        merged.spec,
        1,
        baseVersion,
      );

      const saved = await storage.createDocument({
        orgId,
        type: "layout",
        key: templateName,
        segment,
        data: {
          spec: entity.spec,
          baseDocumentId: publishedDefault.id,
        },
        baseVersion,
        status: "draft",
      });
      flushEvents(entity);
      return saved as unknown as LayoutDTO;
    },

    async get(orgId, id) {
      return requireLayoutDocument(storage, id, orgId) as Promise<LayoutDTO>;
    },

    async list(orgId, filters) {
      const rows = await storage.listDocuments(orgId, {
        type: "layout",
        segment: filters?.segment,
        status: filters?.status,
        key: filters?.templateName,
      });
      return rows as unknown as LayoutDTO[];
    },

    async publish(orgId, id) {
      const existing = await requireLayoutDocument(storage, id, orgId);
      const published = await storage.publishDocument(id);
      const entity = toLayoutEntity(existing as LayoutDTO);
      entity.publish();
      flushEvents(entity);
      return published as unknown as LayoutDTO;
    },

    async archive(orgId, id) {
      const existing = await requireLayoutDocument(storage, id, orgId);
      if (!isPublished(existing)) {
        throw new ValidationError("status", "Only published layouts can be archived");
      }
      const archived = await storage.archiveDocument(id);
      return archived as unknown as LayoutDTO;
    },

    async resolve(orgId, templateName, segment) {
      const row = await storage.findDocument(orgId, "layout", templateName, segment || "default");
      if (!row) return null;
      const rawSpec = row.data?.spec;
      if (!rawSpec || typeof rawSpec !== "object") return null;
      return {
        templateName: row.key,
        segment: row.segment,
        version: row.version,
        spec: rawSpec as Record<string, unknown>,
        renderAs: readRenderAs(row.data),
        contentRef: readContentRef(row.data),
        shellRef: readShellRef(row.data),
        conflicts: [],
      };
    },
  };
}
