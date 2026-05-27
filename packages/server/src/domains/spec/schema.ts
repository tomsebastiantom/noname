import { pgTable, uuid, text, jsonb, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
export const layoutStatus = pgEnum("layout_status", ["draft", "published", "archived"]);
export const layouts = pgTable("layouts", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  templateName: text("template_name").notNull(),
  version: integer("version").notNull().default(1),
  segment: text("segment").notNull().default("default"),
  spec: jsonb("spec").notNull(),
  status: layoutStatus("status").notNull().default("draft"),
  parentVersion: uuid("parent_version"),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});
export const machines = pgTable("machines", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  name: text("name").notNull(),
  definition: jsonb("definition").notNull(),
  version: integer("version").notNull().default(1),
  status: layoutStatus("status").notNull().default("draft"),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});
