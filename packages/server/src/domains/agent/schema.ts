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
  "orchestrate",
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
    createdActorType: text("created_actor_type"),
    createdActorId: text("created_actor_id"),
    createdOnBehalfOf: text("created_on_behalf_of"),
    approvedActorType: text("approved_actor_type"),
    approvedActorId: text("approved_actor_id"),
    approvedOnBehalfOf: text("approved_on_behalf_of"),
    approvedAt: timestamp("approved_at"),
    rejectedActorType: text("rejected_actor_type"),
    rejectedActorId: text("rejected_actor_id"),
    rejectedOnBehalfOf: text("rejected_on_behalf_of"),
    rejectedAt: timestamp("rejected_at"),
    registeredAgentId: uuid("registered_agent_id"),
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
