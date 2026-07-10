import { pgTable, uuid, text, jsonb, timestamp, numeric, pgEnum } from "drizzle-orm/pg-core";

export const orderStatus = pgEnum("order_status", ["pending", "paid", "fulfilled", "cancelled", "refunded"]);

export const machineInstances = pgTable("machine_instances", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  machineName: text("machine_name").notNull(),
  currentState: text("current_state").notNull(),
  context: jsonb("context").notNull().default({}),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

export const machineTransitions = pgTable("machine_transitions", {
  id: uuid("id").defaultRandom().primaryKey(),
  instanceId: uuid("instance_id").notNull(),
  event: text("event").notNull(),
  fromState: text("from_state").notNull(),
  toState: text("to_state").notNull(),
  params: jsonb("params").default({}),
  guardResult: jsonb("guard_result").default({}),
  success: text("success").notNull().default("true"),
  error: text("error"),
  created_at: timestamp("created_at").notNull().defaultNow(),
});

export const carts = pgTable("carts", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  visitorId: uuid("visitor_id").notNull(),
  items: jsonb("items").notNull().default([]),
  subtotal: numeric("subtotal").notNull().default("0"),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  visitorId: uuid("visitor_id").notNull(),
  items: jsonb("items").notNull(),
  subtotal: numeric("subtotal").notNull(),
  tax: numeric("tax").notNull().default("0"),
  total: numeric("total").notNull(),
  status: orderStatus("status").notNull().default("pending"),
  payment_intent_id: text("payment_intent_id"),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});