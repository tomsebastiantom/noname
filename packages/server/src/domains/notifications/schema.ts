import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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
    createdAt: timestamp("created_at").notNull().defaultNow(),
    sentAt: timestamp("sent_at"),
  },
  (table) => [
    index("comms_deliveries_org_id_idx").on(table.orgId),
    index("comms_deliveries_user_id_idx").on(table.userId),
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
