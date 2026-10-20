import { sql } from "drizzle-orm";
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

// Generic state machine engine — vertical-agnostic by design.
//
// Only workflow state is persisted here. There is deliberately NO
// "commerce" (or any other) vertical module: treating a use case as a
// special vertical does not scale — every new use case would mean new tables
// and new code.
//
// Instead, each use case (commerce, booking, membership, SaaS, ...) is
// expressed purely as:
//   1. a machine DEFINITION in JSONB (states, transitions, guards), and
//   2. its data in the machine instance's JSONB `context`,
// both rendered through the json-render "canvas" (spec/layout system) plus
// the flags/context engines. Cart, order, and payment data are just context
// data — commerce is a property of the data, not a structure in the engine.
// If relational ACID is ever required for settlements, add ONE generic
// primitive (e.g. a typed records/ledger table), never a commerce-specific
// one.

export const machineDefinitions = pgTable(
  "machine_definitions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id").notNull(),
    name: text("name").notNull(),
    definition: jsonb("definition").notNull(),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    uniqueName: uniqueIndex("machine_definitions_tenant_name").on(t.orgId, t.name),
  }),
);

export const machineInstances = pgTable(
  "machine_instances",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id").notNull(),
    machineName: text("machine_name").notNull(),
    currentState: text("current_state").notNull(),
    context: jsonb("context").notNull().default({}),
    revision: integer("revision").notNull().default(1),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    orgNameIdx: index("machine_instances_org_name_idx").on(t.orgId, t.machineName),
    orgIdx: index("machine_instances_org_idx").on(t.orgId),
    orgNameStateCreatedIdx: index("machine_instances_org_name_state_created_idx").on(
      t.orgId,
      t.machineName,
      t.currentState,
      t.created_at,
      t.id,
    ),
  }),
);

export const machineTransitions = pgTable(
  "machine_transitions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    instanceId: uuid("instance_id").notNull(),
    /** Denormalised so the log is self-contained: the relay rebuilds an event payload without a join. */
    orgId: text("org_id"),
    /** The instance revision this transition produced. Unique per occurrence, so it also serves as the
     * idempotency key for consumers (see the webhook dedupe key). */
    revision: integer("revision"),
    event: text("event").notNull(),
    fromState: text("from_state").notNull(),
    toState: text("to_state").notNull(),
    params: jsonb("params").default({}),
    guardResult: jsonb("guard_result").default({}),
    success: text("success").notNull().default("true"),
    error: text("error"),
    created_at: timestamp("created_at").notNull().defaultNow(),
    /**
     * Set once the event for this transition has been published. `NULL` means "committed but not yet
     * delivered", which is exactly the state the relay exists to find.
     *
     * This is the same idea as Spring Modulith's event publication registry — an entry written *as part
     * of the original business transaction* and marked when dispatch succeeds — except the entry is
     * already here: `commitTransition` has always written this row inside its transaction. We only had
     * no way to tell which rows had been delivered.
     */
    publishedAt: timestamp("published_at"),
  },
  (t) => ({
    instanceIdx: index("machine_transitions_instance_idx").on(t.instanceId),
    /** Partial, so the relay's scan touches only the backlog and stays small as history grows. */
    unpublishedIdx: index("machine_transitions_unpublished_idx")
      .on(t.id)
      .where(sql`${t.publishedAt} is null`),
  }),
);

// Machine definitions also carry a draft/published status (mirrors the
// documents domain's layout status enum, kept local to this schema).
export const machineStatus = pgEnum("machine_status", ["draft", "published", "archived"]);

export const machines = pgTable("machines", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: text("org_id").notNull(),
  name: text("name").notNull(),
  definition: jsonb("definition").notNull(),
  version: integer("version").notNull().default(1),
  status: machineStatus("status").notNull().default("draft"),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

// Sentinel export to simplify schema re-export in drizzle.ts.
export const machineSchemasUpdated = new Date();
