import { integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/** Per-step outcome. `unknown` is honest for steps that predate this table. */
export type ProvisioningStepState = {
  status: "pending" | "done" | "failed" | "unknown";
  error?: string;
  at?: string;
};

export type ProvisioningSteps = {
  directory?: ProvisioningStepState;
  identity?: ProvisioningStepState;
  eval_account?: ProvisioningStepState;
  audit?: ProvisioningStepState;
};

/**
 * One row per provisioning request.
 *
 * `steps` is the point: it makes a partial run explainable and resumable ("directory done, eval account failed:
 * 403") instead of a 500 and a guess. It is the same idea as Stripe Connect's `requirements.currently_due` — the
 * operation is described by what is still outstanding, not by a single success/failure bit.
 */
export const tenantProvisioning = pgTable(
  "tenant_provisioning",
  {
    orgId: text("org_id").primaryKey(),
    idempotencyKey: text("idempotency_key").notNull(),
    state: text("state").notNull().default("pending"),
    steps: jsonb("steps").$type<ProvisioningSteps>().notNull().default({}),
    requestedBy: text("requested_by").notNull(),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("tenant_provisioning_idempotency_uq").on(table.idempotencyKey)],
);

export const PROVISIONING_STATES = ["pending", "in_progress", "ready", "failed"] as const;
export type ProvisioningState = (typeof PROVISIONING_STATES)[number];
