import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const commsDeliveries = pgTable(
  "comms_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id").notNull(),
    userId: text("user_id"),
    channel: text("channel").notNull(),
    provider: text("provider").notNull(),
    toAddress: text("to_address").notNull(),
    subject: text("subject"),
    status: text("status").notNull(),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    trigger: text("trigger"),
    templateId: text("template_id"),
    idempotencyKey: text("idempotency_key"),
    attemptCount: integer("attempt_count").notNull().default(0),
    bodyHtml: text("body_html"),
    bodyText: text("body_text"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    sentAt: timestamp("sent_at"),
  },
  (table) => [
    index("comms_deliveries_org_id_idx").on(table.orgId),
    index("comms_deliveries_user_id_idx").on(table.userId),
    index("comms_deliveries_status_idx").on(table.status),
    index("comms_deliveries_created_at_idx").on(table.createdAt),
    uniqueIndex("comms_deliveries_org_idempotency_idx").on(table.orgId, table.idempotencyKey),
  ],
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id").notNull(),
    userId: text("user_id").notNull(),
    agentTaskEmail: boolean("agent_task_email").notNull().default(true),
    marketingEmail: boolean("marketing_email").notNull().default(false),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("notification_preferences_org_user_idx").on(table.orgId, table.userId)],
);
