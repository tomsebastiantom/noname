import type { ContentStorage, ContentValidator, ContentEntryDTO } from "./ports";
import { ContentEntry } from "./entity";
import { eventBus } from "../../shared/event-bus";
import { NotFoundError, ValidationError } from "../../shared/domain-error";

export function createContentService(storage: ContentStorage, validator: ContentValidator) {
  const flushEvents = (entity: ContentEntry) => {
    for (const event of entity.commit()) {
      eventBus.publish("content." + event.name, event.data);
    }
  };

  return {
    create: async (tenantId: string, type: string, data: Record<string, unknown>): Promise<ContentEntryDTO> => {
      const result = await validator.validate(type, data);
      if (!result.valid) {
        throw new ValidationError(type, result.errors?.join(", ") || "Invalid data");
      }
      const slug = slugify((data.title || data.name || crypto.randomUUID()) as string);
      const entity = ContentEntry.create(tenantId, type, slug, data);
      const saved = await storage.create(entity.tenantId, entity.type, entity.slug, entity.data);
      flushEvents(entity);
      return saved;
    },

    findByType: (tenantId: string, type: string): Promise<ContentEntryDTO[]> =>
      storage.findByType(tenantId, type),

    findBySlug: (tenantId: string, type: string, slug: string): Promise<ContentEntryDTO | null> =>
      storage.findBySlug(tenantId, type, slug),

    update: async (tenantId: string, type: string, slug: string, data: Record<string, unknown>): Promise<ContentEntryDTO> => {
      const existing = await storage.findBySlug(tenantId, type, slug);
      if (!existing) throw new NotFoundError("ContentEntry", `${type}/${slug}`);
      const result = await validator.validate(type, data);
      if (!result.valid) {
        throw new ValidationError(type, result.errors?.join(", ") || "Invalid data");
      }
      const entity = new ContentEntry(existing.id, tenantId, type, slug, existing.data);
      entity.update(data);
      const updated = await storage.update(tenantId, type, slug, data);
      flushEvents(entity);
      return updated;
    },

    delete: async (tenantId: string, type: string, slug: string): Promise<void> => {
      const existing = await storage.findBySlug(tenantId, type, slug);
      if (!existing) throw new NotFoundError("ContentEntry", `${type}/${slug}`);
      const entity = new ContentEntry(existing.id, tenantId, type, slug, existing.data);
      entity.delete();
      await storage.delete(tenantId, type, slug);
      flushEvents(entity);
    },
  };
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}