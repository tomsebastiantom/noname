import type { ContentStorage, ContentValidator } from "./ports";
import { ContentEntry } from "./entity";
import { eventBus } from "../../shared/event-bus";

export function createContentService(storage: ContentStorage, validator: ContentValidator) {
  const flushEvents = (entity: ContentEntry) => {
    // Commit returns collected events and clears the entity's queue.
    // Events go to BullMQ for cross-domain subscribers (analytics, agents).
    // This is NOT event sourcing — events are transient, state is in Postgres.
    for (const event of entity.commit()) {
      eventBus.publish("content." + event.name, event.data);
    }
  };

  return {
    create: async (tenantId: string, type: string, slug: string, data: Record<string, unknown>) => {
      await validator.validate(type, data);
      const entity = ContentEntry.create(tenantId, type, slug, data);
      const saved = await storage.create(entity.tenantId, entity.type, entity.slug, entity.data);
      flushEvents(entity);
      return saved;
    },
    findByType: (tenantId: string, type: string) => storage.findByType(tenantId, type),
    findBySlug: (tenantId: string, type: string, slug: string) => storage.findBySlug(tenantId, type, slug),
    update: async (tenantId: string, type: string, slug: string, data: Record<string, unknown>) => {
      const existing = await storage.findBySlug(tenantId, type, slug);
      if (!existing) throw new Error("Not found");
      const entity = new ContentEntry(existing.id, tenantId, type, slug, existing.data);
      entity.update(data);
      await storage.update(tenantId, type, slug, data);
      flushEvents(entity);
    },
    delete: async (tenantId: string, type: string, slug: string) => {
      await storage.delete(tenantId, type, slug);
      const entity = new ContentEntry("", tenantId, type, slug, {});
      entity.delete();
      flushEvents(entity);
    },
  };
}
