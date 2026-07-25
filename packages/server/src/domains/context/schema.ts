import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const segments = pgTable(
  "segments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    hash: text("hash").notNull(),
    signals: jsonb("signals").notNull().default([]),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    uniqueSegment: uniqueIndex("unique_segment").on(t.tenantId, t.hash),
  }),
);

export const contextCache = pgTable(
  "context_cache",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    visitorId: text("visitor_id").notNull(),
    segmentHash: text("segment_hash").notNull(),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    uniqueCache: uniqueIndex("unique_cache").on(t.tenantId, t.visitorId),
  }),
);
