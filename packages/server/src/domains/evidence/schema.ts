import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const evidenceRecords = pgTable(
  "evidence_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id").notNull(),
    type: text("type").notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    source: text("source").notNull(),
    occurredAt: timestamp("occurred_at").notNull(),
    recordedAt: timestamp("recorded_at").notNull().defaultNow(),
    correlationId: text("correlation_id"),
    causationId: text("causation_id"),
    idempotencyKey: text("idempotency_key"),
    integrityHash: text("integrity_hash"),
  },
  (table) => [
    index("evidence_records_org_type_recorded_idx").on(table.orgId, table.type, table.recordedAt),
    index("evidence_records_org_subject_idx").on(table.orgId, table.subjectType, table.subjectId),
    uniqueIndex("evidence_records_org_type_idempotency_idx")
      .on(table.orgId, table.type, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
  ],
);

export const evidenceActivities = pgTable(
  "evidence_activities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id").notNull(),
    type: text("type").notNull(),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    inputRecordIds: jsonb("input_record_ids").$type<string[]>().notNull().default([]),
    outputRecordIds: jsonb("output_record_ids").$type<string[]>().notNull().default([]),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp("occurred_at").notNull(),
    recordedAt: timestamp("recorded_at").notNull().defaultNow(),
    correlationId: text("correlation_id"),
    causationId: text("causation_id"),
    idempotencyKey: text("idempotency_key"),
  },
  (table) => [
    index("evidence_activities_org_type_recorded_idx").on(
      table.orgId,
      table.type,
      table.recordedAt,
    ),
    uniqueIndex("evidence_activities_org_type_idempotency_idx")
      .on(table.orgId, table.type, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
  ],
);

export const evidenceLinks = pgTable(
  "evidence_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id").notNull(),
    fromId: uuid("from_id").notNull(),
    toId: uuid("to_id").notNull(),
    relation: text("relation").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("evidence_links_org_from_idx").on(table.orgId, table.fromId),
    index("evidence_links_org_to_idx").on(table.orgId, table.toId),
    uniqueIndex("evidence_links_org_edge_idx").on(
      table.orgId,
      table.fromId,
      table.toId,
      table.relation,
    ),
  ],
);

export const evidenceAuditEvents = pgTable(
  "evidence_audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id").notNull(),
    action: text("action").notNull(),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    reason: text("reason"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp("occurred_at").notNull(),
    correlationId: text("correlation_id"),
    idempotencyKey: text("idempotency_key"),
    recordedAt: timestamp("recorded_at").notNull().defaultNow(),
  },
  (table) => [
    index("evidence_audit_org_subject_idx").on(table.orgId, table.subjectType, table.subjectId),
    index("evidence_audit_org_recorded_idx").on(table.orgId, table.recordedAt),
    uniqueIndex("evidence_audit_org_action_idempotency_idx")
      .on(table.orgId, table.action, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
  ],
);
