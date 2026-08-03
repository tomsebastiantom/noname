import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const agentTaskType = pgEnum("agent_task_type", [
  "generate_layout",
  "generate_content",
  "generate_machine",
  "analyze_analytics",
]);

export const agentTaskStatus = pgEnum("agent_task_status", [
  "pending",
  "running",
  "completed",
  "failed",
  "approved",
  "rejected",
]);

export const agentTasks = pgTable(
  "agent_tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id").notNull(),
    type: agentTaskType("type").notNull(),
    status: agentTaskStatus("status").notNull().default("pending"),
    prompt: text("prompt").notNull(),
    input: jsonb("input").notNull().default({}),
    output: jsonb("output"),
    error: text("error"),
    model: text("model"),
    tokens: integer("tokens"),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantStatus: index("agent_tasks_tenant_status").on(t.orgId, t.status),
    tenantType: index("agent_tasks_tenant_type").on(t.orgId, t.type),
  }),
);

export const registeredAgents = pgTable(
  "registered_agents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id").notNull(),
    slug: text("slug").notNull(),
    label: text("label").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
    allowedTools: jsonb("allowed_tools").notNull().default([]),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    uniqueSlug: uniqueIndex("registered_agents_org_slug").on(t.orgId, t.slug),
  }),
);
