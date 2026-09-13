import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const providerEventReceipts = pgTable(
  "provider_event_receipts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id").notNull(),
    connectionId: text("connection_id").notNull(),
    eventKey: text("event_key").notNull(),
    providerEventId: text("provider_event_id"),
    deliveryId: text("delivery_id"),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull(),
    error: text("error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("provider_event_receipts_connection_key_idx").on(
      table.connectionId,
      table.eventKey,
    ),
    index("provider_event_receipts_org_status_idx").on(table.orgId, table.status),
  ],
);
