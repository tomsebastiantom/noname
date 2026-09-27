import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * Legacy request-signal data model retained so existing tables/rows stay visible to Drizzle and
 * non-destructive schema pushes do not drop them. No active service or route uses these tables.
 * Delete only after the approved historical-data retention and consumer review.
 */
export const segments = pgTable(
  "segments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id").notNull(),
    hash: text("hash").notNull(),
    signals: jsonb("signals").notNull().default([]),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    uniqueSegment: uniqueIndex("unique_segment").on(t.orgId, t.hash),
  }),
);

export const contextCache = pgTable(
  "context_cache",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id").notNull(),
    visitorId: text("visitor_id").notNull(),
    segmentHash: text("segment_hash").notNull(),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    uniqueCache: uniqueIndex("unique_cache").on(t.orgId, t.visitorId),
  }),
);
