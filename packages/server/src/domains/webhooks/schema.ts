import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export { webhookReceipts } from "./inbound-schema";

export const webhookSubscriptions = pgTable(
  "webhook_subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id").notNull(),
    url: text("url").notNull(),
    eventTypes: jsonb("event_types").$type<string[]>().notNull(),
    enabled: boolean("enabled").notNull().default(true),
    description: text("description"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("webhook_subscriptions_org_id_idx").on(table.orgId),
    index("webhook_subscriptions_enabled_idx").on(table.enabled),
  ],
);

export const webhookOutboundDeliveries = pgTable(
  "webhook_outbound_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id").notNull(),
    subscriptionId: uuid("subscription_id").notNull(),
    eventType: text("event_type").notNull(),
    eventId: text("event_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastStatusCode: integer("last_status_code"),
    error: text("error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    deliveredAt: timestamp("delivered_at"),
  },
  (table) => [
    index("webhook_outbound_org_id_idx").on(table.orgId),
    index("webhook_outbound_subscription_idx").on(table.subscriptionId),
    index("webhook_outbound_status_idx").on(table.status),
  ],
);
