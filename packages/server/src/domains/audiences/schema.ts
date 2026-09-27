import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const audienceDefinitions = pgTable(
  "audience_definitions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id").notNull(),
    key: text("key").notNull(),
    status: text("status").notNull().default("draft"), // active | disabled | archived
    activeVersion: integer("active_version"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantKey: uniqueIndex("audience_definitions_tenant_key").on(t.orgId, t.key),
    tenantStatus: index("audience_definitions_tenant_status").on(t.orgId, t.status),
  }),
);

export const audienceDefinitionVersions = pgTable(
  "audience_definition_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id").notNull(),
    audienceKey: text("audience_key").notNull(),
    version: integer("version").notNull(),
    activityType: text("activity_type").notNull(),
    activityVersion: integer("activity_version").notNull(),
    condition: jsonb("condition").notNull(),
    action: text("action").notNull(), // assign | remove
    expiry: jsonb("expiry").notNull(), // { afterMs } | { untilRevoked: true }
    status: text("status").notNull().default("draft"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    activatedAt: timestamp("activated_at"),
  },
  (t) => ({
    tenantAudienceVersion: uniqueIndex("audience_definition_versions_tenant_key_version").on(
      t.orgId,
      t.audienceKey,
      t.version,
    ),
    tenantActive: index("audience_definition_versions_active").on(
      t.orgId,
      t.activityType,
      t.status,
    ),
  }),
);

export const audienceExperienceBindings = pgTable(
  "audience_experience_bindings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id").notNull(),
    audienceKey: text("audience_key").notNull(),
    version: integer("version").notNull(),
    pageKey: text("page_key").notNull(),
    locale: text("locale"),
    schemaId: text("schema_id").notNull(),
    variantId: text("variant_id").notNull(),
    goalEvent: text("goal_event").notNull(),
    attributionWindowMs: integer("attribution_window_ms").notNull(),
    status: text("status").notNull().default("draft"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    activatedAt: timestamp("activated_at"),
  },
  (t) => ({
    tenantBindingVersion: uniqueIndex("audience_bindings_tenant_key_version").on(
      t.orgId,
      t.audienceKey,
      t.version,
    ),
    tenantLookup: index("audience_bindings_tenant_lookup").on(t.orgId, t.audienceKey, t.status),
  }),
);

// Decision/outcome data is bounded by the binding attribution window; storage cleanup runs on ledger reads/writes.
export const audienceExperienceDecisions = pgTable(
  "audience_experience_decisions",
  {
    decisionId: uuid("decision_id").primaryKey(),
    orgId: text("org_id").notNull(),
    verifiedUserId: text("verified_user_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    audienceKey: text("audience_key").notNull(),
    audienceDefinitionVersion: integer("audience_definition_version").notNull(),
    bindingId: uuid("binding_id").notNull(),
    bindingVersion: integer("binding_version").notNull(),
    pageKey: text("page_key").notNull(),
    locale: text("locale"),
    schemaId: text("schema_id").notNull(),
    variantId: text("variant_id").notNull(),
    goalEvent: text("goal_event").notNull(),
    attributionWindowMs: integer("attribution_window_ms").notNull(),
    servedAt: timestamp("served_at").notNull(),
    renderedAt: timestamp("rendered_at"),
    renderDeadlineAt: timestamp("render_deadline_at").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (t) => ({
    tenantDecision: uniqueIndex("audience_decisions_tenant_id").on(t.orgId, t.decisionId),
    subjectWindow: index("audience_decisions_subject_window").on(
      t.orgId,
      t.verifiedUserId,
      t.goalEvent,
      t.renderedAt,
      t.expiresAt,
    ),
  }),
);

export const audienceExperienceOutcomes = pgTable(
  "audience_experience_outcomes",
  {
    orgId: text("org_id").notNull(),
    activityId: text("activity_id").notNull(),
    decisionId: uuid("decision_id").notNull(),
    activityType: text("activity_type").notNull(),
    occurredAt: timestamp("occurred_at").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantActivity: uniqueIndex("audience_experience_outcomes_tenant_activity").on(
      t.orgId,
      t.activityId,
    ),
    decisionLookup: index("audience_experience_outcomes_decision").on(
      t.orgId,
      t.decisionId,
      t.expiresAt,
    ),
    decisionReference: foreignKey({
      name: "audience_exp_outcome_decision_fk",
      columns: [t.decisionId],
      foreignColumns: [audienceExperienceDecisions.decisionId],
    }).onDelete("cascade"),
  }),
);

export const audienceActivityReceipts = pgTable(
  "audience_activity_receipts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id").notNull(),
    activityId: text("activity_id").notNull(),
    activityType: text("activity_type").notNull(),
    activityVersion: integer("activity_version").notNull(),
    // Subject and minimum registered facts support resumable processing; the adapter clears both on completion.
    subjectUserId: text("subject_user_id"),
    occurredAt: timestamp("occurred_at").notNull(),
    facts: jsonb("facts").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    processedAt: timestamp("processed_at"),
  },
  (t) => ({
    tenantActivity: uniqueIndex("audience_receipts_tenant_activity").on(t.orgId, t.activityId),
    pending: index("audience_receipts_pending").on(t.orgId, t.status, t.createdAt),
  }),
);

export const audienceAssignments = pgTable(
  "audience_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id").notNull(),
    userId: text("user_id").notNull(),
    audienceKey: text("audience_key").notNull(),
    sourceActivityId: text("source_activity_id").notNull(),
    definitionVersion: integer("definition_version").notNull(),
    assignedAt: timestamp("assigned_at").notNull(),
    expiresAt: timestamp("expires_at"),
    revokedAt: timestamp("revoked_at"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantMember: uniqueIndex("audience_assignments_tenant_member").on(
      t.orgId,
      t.userId,
      t.audienceKey,
    ),
    tenantActive: index("audience_assignments_active_lookup").on(
      t.orgId,
      t.userId,
      t.revokedAt,
      t.expiresAt,
    ),
  }),
);

export const audienceAssignmentHistory = pgTable(
  "audience_assignment_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id").notNull(),
    userId: text("user_id").notNull(),
    audienceKey: text("audience_key").notNull(),
    activityId: text("activity_id").notNull(),
    definitionVersion: integer("definition_version").notNull(),
    action: text("action").notNull(),
    occurredAt: timestamp("occurred_at").notNull(),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantSubject: index("audience_assignment_history_subject").on(
      t.orgId,
      t.userId,
      t.audienceKey,
      t.createdAt,
    ),
    uniqueEvent: uniqueIndex("audience_assignment_history_event").on(
      t.orgId,
      t.activityId,
      t.audienceKey,
    ),
  }),
);

export const audienceAuditLog = pgTable(
  "audience_audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id").notNull(),
    actorUserId: text("actor_user_id").notNull(),
    audienceKey: text("audience_key").notNull(),
    action: text("action").notNull(),
    version: integer("version"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantHistory: index("audience_audit_tenant_history").on(t.orgId, t.audienceKey, t.createdAt),
  }),
);
