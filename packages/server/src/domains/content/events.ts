// Event name constants for cross-domain use.
// Events are published by entities (via AggregateRoot) and consumed by other domains.
// Flow: Entity.apply() -> engine.flushEvents() -> eventBus.publish() -> subscribers

export const ContentEvents = {
  CREATED: "content.created",
  UPDATED: "content.updated",
  DELETED: "content.deleted",
  PUBLISHED: "content.published",
} as const;
