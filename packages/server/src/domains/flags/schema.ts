import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const flagType = pgEnum("flag_type", ["boolean", "multivariate", "percentage"]);
export const flagStatus = pgEnum("flag_status", ["active", "inactive", "archived"]);

export const flags = pgTable(
  "flags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id").notNull(),
    key: text("key").notNull(),
    type: flagType("type").notNull(),
    description: text("description").notNull().default(""),
    defaultValue: jsonb("default_value").notNull(),
    targeting: jsonb("targeting").notNull().default([]),
    status: flagStatus("status").notNull().default("active"),
    schemaId: uuid("schema_id"),
    variantId: uuid("variant_id"),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantKey: uniqueIndex("flags_tenant_key").on(t.orgId, t.key),
    tenantStatus: index("flags_tenant_status").on(t.orgId, t.status),
    tenantSchema: index("flags_tenant_schema").on(t.orgId, t.schemaId),
  }),
);

export const flagEvaluations = pgTable(
  "flag_evaluations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    flagId: uuid("flag_id").notNull(),
    orgId: text("org_id").notNull(),
    contextHash: text("context_hash").notNull(),
    value: jsonb("value").notNull(),
    matchedRule: jsonb("matched_rule"),
    reason: text("reason").notNull(),
    schemaId: uuid("schema_id"),
    variantId: uuid("variant_id"),
    evaluated_at: timestamp("evaluated_at").notNull().defaultNow(),
  },
  (t) => ({
    flagTime: index("flag_evals_flag_time").on(t.flagId, t.evaluated_at),
    contextTime: index("flag_evals_context_time").on(t.orgId, t.contextHash, t.evaluated_at),
  }),
);
