import { sql } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Tenant directory — the inventory a wave must consult before it can name an org.
 *
 * Why a table instead of deriving from `documents`: an org exists only as an `org_id` column value scattered
 * across tables, so "which tenants exist and may be touched" had no answer. The release control plane could
 * therefore mark a typo'd or suspended org as eligible.
 *
 * `status` is deliberately small and closed:
 *   active     — may receive releases
 *   suspended  — must never be selected by a wave
 *   offboarding— excluded until deleted
 *
 * `excluded_reason` records *why* a tenant is skipped when it is still `active` (legal hold, maintenance,
 * customer opt-out). It is a reason string, not a second status, so the lifecycle stays one field.
 */
export const tenantDirectory = pgTable(
  "tenant_directory",
  {
    orgId: text("org_id").primaryKey(),
    slug: text("slug").notNull(),
    status: text("status").notNull().default("active"),
    plan: text("plan"),
    region: text("region"),
    excludedReason: text("excluded_reason"),
    /** How far tenant creation got. Eligibility requires `ready`; see the provisioning RFC. */
    provisioningState: text("provisioning_state").notNull().default("ready"),
    /** The platform org is in the directory so it can be recognised, never selected. */
    isPlatform: text("is_platform").notNull().default("false"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("tenant_directory_slug_uq").on(table.slug),
    index("tenant_directory_status_idx").on(table.status),
  ],
);

/** Valid lifecycle values; the API validates against this rather than an enum in Postgres. */
/**
 * Lifecycle, smallest closed set that still tells the truth:
 *   active      — may receive a release
 *   suspended   — must not, but the data stays
 *   offboarding — left on purpose; credentials revoked
 *   deleted     — soft delete: hidden from the console, data still present, restorable inside the retention window
 * A **purge** removes the rows entirely; that is a separate, irreversible act, not a status.
 */
export const TENANT_STATUSES = ["active", "suspended", "offboarding", "deleted"] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const tenantStatusCheck = sql`${tenantDirectory.status} in ('active','suspended','offboarding')`;
