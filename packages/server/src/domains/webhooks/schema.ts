import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const webhookReceipts = pgTable(
  "webhook_receipts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id"),
    provider: text("provider").notNull(),
    externalEventId: text("external_event_id").notNull(),
    eventType: text("event_type").notNull(),
    status: text("status").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    error: text("error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    processedAt: timestamp("processed_at"),
  },
  (table) => [
    uniqueIndex("webhook_receipts_provider_event_idx").on(table.provider, table.externalEventId),
    index("webhook_receipts_org_id_idx").on(table.orgId),
    index("webhook_receipts_status_idx").on(table.status),
  ],
);
