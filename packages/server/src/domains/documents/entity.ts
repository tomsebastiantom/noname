import { AggregateRoot } from "../../shared/aggregate-root";
import { ContentEvents } from "./events";

// Content document — extends AggregateRoot so it can collect domain events.
// Emits content.* events (distinct namespace from layout.*).
export class ContentDocument extends AggregateRoot {
  constructor(
    public readonly id: string,
    public readonly orgId: string,
    public readonly type: string,
    public data: Record<string, unknown>,
    public status: "draft" | "published" | "archived",
    public readonly createdAt: Date = new Date(),
  ) {
    super();
  }

  static create(orgId: string, type: string, data: Record<string, unknown>): ContentDocument {
    const entry = new ContentDocument(crypto.randomUUID(), orgId, type, data, "draft");
    entry.apply(ContentEvents.CREATED, { id: entry.id, orgId, type, data });
    return entry;
  }

  update(data: Record<string, unknown>): void {
    this.data = data;
    this.apply(ContentEvents.UPDATED, { id: this.id, orgId: this.orgId, type: this.type, data });
  }

  publish(): void {
    this.status = "published";
    this.apply(ContentEvents.PUBLISHED, { id: this.id, orgId: this.orgId, type: this.type });
  }

  deleteEntry(): void {
    this.apply(ContentEvents.DELETED, { id: this.id, orgId: this.orgId, type: this.type });
  }
}

// Layout document — json-render template with per-segment variants.
// Emits layout.* events (distinct namespace from content.*).
export class LayoutDocument extends AggregateRoot {
  constructor(
    public readonly id: string,
    public readonly orgId: string,
    public templateName: string,
    public version: number,
    public segment: string,
    public spec: Record<string, unknown>,
    public status: "draft" | "published" | "archived",
    public baseVersion: number | null,
    public readonly createdAt: Date,
    public updatedAt: Date,
  ) {
    super();
  }

  static create(
    orgId: string,
    templateName: string,
    segment: string,
    spec: Record<string, unknown>,
    version: number,
    baseVersion: number | null,
  ): LayoutDocument {
    const layout = new LayoutDocument(
      crypto.randomUUID(),
      orgId,
      templateName,
      version,
      segment,
      spec,
      "draft",
      baseVersion,
      new Date(),
      new Date(),
    );
    layout.apply("layout.created", {
      id: layout.id,
      orgId,
      templateName,
      segment,
      version,
    });
    return layout;
  }

  update(spec?: Record<string, unknown>, status?: "draft" | "published" | "archived"): void {
    if (spec !== undefined) this.spec = spec;
    if (status !== undefined) this.status = status;
    this.updatedAt = new Date();
    this.apply("layout.updated", {
      id: this.id,
      orgId: this.orgId,
      templateName: this.templateName,
      segment: this.segment,
      version: this.version,
    });
  }

  publish(): void {
    if (this.status === "archived") {
      throw new Error("Cannot publish an archived layout");
    }
    this.status = "published";
    this.updatedAt = new Date();
    this.apply("layout.published", {
      id: this.id,
      orgId: this.orgId,
      templateName: this.templateName,
      segment: this.segment,
      version: this.version,
      spec: this.spec,
    });
  }

  archive(): void {
    this.status = "archived";
    this.updatedAt = new Date();
    this.apply("layout.archived", {
      id: this.id,
      orgId: this.orgId,
      templateName: this.templateName,
      segment: this.segment,
      version: this.version,
    });
  }

  recordVariantCreated(): void {
    this.apply("layout.variant_created", {
      id: this.id,
      orgId: this.orgId,
      templateName: this.templateName,
      segment: this.segment,
      version: this.version,
    });
  }
}
