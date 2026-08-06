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
import { DEFAULT_NOTIFICATION_PREFERENCES, type NotificationPreferences } from "./preferences";

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
    preferences: jsonb("preferences")
      .$type<NotificationPreferences>()
      .notNull()
      .default(DEFAULT_NOTIFICATION_PREFERENCES),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("notification_preferences_org_user_idx").on(table.orgId, table.userId)],
);

export const commsInboxItems = pgTable(
  "comms_inbox_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id").notNull(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    trigger: text("trigger"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("comms_inbox_org_user_idx").on(table.orgId, table.userId),
    index("comms_inbox_read_at_idx").on(table.readAt),
    index("comms_inbox_created_at_idx").on(table.createdAt),
  ],
);

/** Provider-sourced telemetry (opens/clicks/bounces) — distinct from product analytics. */
export const commsDeliveryEvents = pgTable(
  "comms_delivery_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id").notNull(),
    deliveryId: uuid("delivery_id").notNull(),
    eventType: text("event_type").notNull(),
    occurredAt: timestamp("occurred_at").notNull(),
    providerEventId: text("provider_event_id"),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("comms_delivery_events_delivery_id_idx").on(table.deliveryId),
    index("comms_delivery_events_org_id_idx").on(table.orgId),
    uniqueIndex("comms_delivery_events_provider_event_id_idx").on(table.providerEventId),
  ],
);
