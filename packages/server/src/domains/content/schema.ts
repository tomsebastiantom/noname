import { pgTable, uuid, text, jsonb, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const entryStatus = pgEnum("entry_status", ["draft", "published", "archived"]);
export const contentEntries = pgTable("content_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  type: text("type").notNull(),
  slug: text("slug").notNull(),
  data: jsonb("data").notNull(),
  meta: jsonb("meta").default({}),
  status: entryStatus("status").notNull().default("draft"),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});
export const contentTypes = pgTable("content_types", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  name: text("name").notNull().unique(),
  schema: jsonb("schema").notNull(),
  created_at: timestamp("created_at").notNull().defaultNow(),
});
