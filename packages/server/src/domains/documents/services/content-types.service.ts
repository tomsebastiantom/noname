import { NotFoundError, ValidationError } from "../../../shared/domain-error";
import { eventBus } from "../../../shared/event-bus";
import { ContentTypeEvents } from "../events";
import type { ContentTypeDocumentService, DocumentStorage } from "../ports";
import { validateContentTypeName, validateSchema } from "./content-type-validation";

export function createContentTypesService(storage: DocumentStorage): ContentTypeDocumentService {
  return {
    async create(orgId, name, schema) {
      validateContentTypeName(name);
      validateSchema(schema);
      const existing = await storage.findContentTypeByName(orgId, name);
      if (existing) throw new ValidationError("name", `Content type '${name}' already exists`);
      const created = await storage.createContentType(orgId, name, schema);
      void eventBus.publish(ContentTypeEvents.CREATED, { orgId, name });
      return created;
    },
    list: (orgId) => storage.findContentTypes(orgId),
    get: (orgId, name) => storage.findContentTypeByName(orgId, name),
    async update(orgId, name, schema) {
      validateSchema(schema);
      const existing = await storage.findContentTypeByName(orgId, name);
      if (!existing) throw new NotFoundError("ContentType", name);
      const updated = await storage.updateContentType(orgId, name, schema);
      void eventBus.publish(ContentTypeEvents.UPDATED, { orgId, name });
      return updated;
    },
  };
}
