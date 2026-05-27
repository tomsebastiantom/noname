import { AggregateRoot } from "../../shared/aggregate-root";

// Content entity — extends AggregateRoot so it can collect domain events.
// When created, events are applied in memory. Flushed on repository save.
export class ContentEntry extends AggregateRoot {
  constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public readonly type: string,
    public readonly slug: string,
    public data: Record<string, unknown>,
    public readonly createdAt: Date = new Date(),
  ) {
    super();
  }

  static create(tenantId: string, type: string, slug: string, data: Record<string, unknown>): ContentEntry {
    const entry = new ContentEntry(crypto.randomUUID(), tenantId, type, slug, data);
    entry.apply("content.created", { id: entry.id, type, slug, data });
    return entry;
  }

  update(data: Record<string, unknown>): void {
    this.data = data;
    this.apply("content.updated", { id: this.id, type: this.type, data });
  }

  delete(): void {
    this.apply("content.deleted", { id: this.id, type: this.type });
  }
}
