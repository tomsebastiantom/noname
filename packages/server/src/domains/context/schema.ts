import { pgTable, uuid, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export const segments = pgTable("segments", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  hash: text("hash").notNull(),
  signals: jsonb("signals").notNull().default([]),
  created_at: timestamp("created_at").notNull().defaultNow(),
});

export const contextCache = pgTable("context_cache", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  visitorId: text("visitor_id").notNull(),
  segmentHash: text("segment_hash").notNull(),
  created_at: timestamp("created_at").notNull().defaultNow(),
});