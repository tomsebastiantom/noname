import { type WriteAudit, withWriteAudit } from "@noname/auth";
import { AggregateRoot } from "../../shared/aggregate-root";
import { ContentEvents, LayoutEvents } from "./events";

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

  static create(
    orgId: string,
    type: string,
    data: Record<string, unknown>,
    audit?: WriteAudit,
  ): ContentDocument {
    const entry = new ContentDocument(crypto.randomUUID(), orgId, type, data, "draft");
    const payload = { id: entry.id, orgId, type, data };
    entry.apply(ContentEvents.CREATED, audit ? withWriteAudit(payload, audit) : payload);
    return entry;
  }

  update(data: Record<string, unknown>, audit?: WriteAudit): void {
    this.data = data;
    const payload = { id: this.id, orgId: this.orgId, type: this.type, data };
    this.apply(ContentEvents.UPDATED, audit ? withWriteAudit(payload, audit) : payload);
  }

  publish(audit?: WriteAudit): void {
    this.status = "published";
    const payload = { id: this.id, orgId: this.orgId, type: this.type };
    this.apply(ContentEvents.PUBLISHED, audit ? withWriteAudit(payload, audit) : payload);
  }

  deleteEntry(audit?: WriteAudit): void {
    const payload = { id: this.id, orgId: this.orgId, type: this.type };
    this.apply(ContentEvents.DELETED, audit ? withWriteAudit(payload, audit) : payload);
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
    audit?: WriteAudit,
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
    const payload = {
      id: layout.id,
      orgId,
      templateName,
      segment,
      version,
    };
    layout.apply(LayoutEvents.CREATED, audit ? withWriteAudit(payload, audit) : payload);
    return layout;
  }

  update(
    spec?: Record<string, unknown>,
    status?: "draft" | "published" | "archived",
    audit?: WriteAudit,
  ): void {
    if (spec !== undefined) this.spec = spec;
    if (status !== undefined) this.status = status;
    this.updatedAt = new Date();
    const payload = {
      id: this.id,
      orgId: this.orgId,
      templateName: this.templateName,
      segment: this.segment,
      version: this.version,
    };
    this.apply(LayoutEvents.UPDATED, audit ? withWriteAudit(payload, audit) : payload);
  }

  publish(audit?: WriteAudit): void {
    if (this.status === "archived") {
      throw new Error("Cannot publish an archived layout");
    }
    this.status = "published";
    this.updatedAt = new Date();
    const payload = {
      id: this.id,
      orgId: this.orgId,
      templateName: this.templateName,
      segment: this.segment,
      version: this.version,
      spec: this.spec,
    };
    this.apply(LayoutEvents.PUBLISHED, audit ? withWriteAudit(payload, audit) : payload);
  }

  archive(audit?: WriteAudit): void {
    this.status = "archived";
    this.updatedAt = new Date();
    const payload = {
      id: this.id,
      orgId: this.orgId,
      templateName: this.templateName,
      segment: this.segment,
      version: this.version,
    };
    this.apply(LayoutEvents.ARCHIVED, audit ? withWriteAudit(payload, audit) : payload);
  }

  recordVariantCreated(audit?: WriteAudit): void {
    const payload = {
      id: this.id,
      orgId: this.orgId,
      templateName: this.templateName,
      segment: this.segment,
      version: this.version,
    };
    this.apply(LayoutEvents.VARIANT_CREATED, audit ? withWriteAudit(payload, audit) : payload);
  }
}
