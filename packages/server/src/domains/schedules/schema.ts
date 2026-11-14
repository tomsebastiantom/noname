import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Runtime state for a schedule **defined in code** (`definitions.ts`).
 *
 * The definition owns the name, the handler and the default cadence; this table holds only what an operator changed —
 * pause, a different pattern, or turning the dry run off — so the code default returns when the override is cleared.
 */
export const scheduleState = pgTable("schedule_state", {
  name: text("name").primaryKey(),
  /** Cron override; null means "use the definition's defaultPattern". */
  pattern: text("pattern"),
  paused: text("paused").notNull().default("false"),
  /**
   * Dry-run is state, not a run: a schedule that is dry-running has simply not been trusted with writes yet.
   * Null falls back to the definition's `dryRunDefault`.
   */
  dryRun: text("dry_run"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by"),
});

/**
 * One row per execution attempt — the history an operator reads.
 *
 * A run that silently does nothing must be visible here, so every attempt is recorded whether it succeeded, failed,
 * or was skipped because the definition had no handler.
 */
export const scheduleRuns = pgTable(
  "schedule_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: text("status").notNull().default("running"),
    items: integer("items"),
    dryRun: text("dry_run").notNull().default("true"),
    error: text("error"),
  },
  (table) => [index("schedule_runs_name_started_idx").on(table.name, table.startedAt)],
);

export const SCHEDULE_RUN_STATUSES = ["running", "ok", "failed", "skipped"] as const;
export type ScheduleRunStatus = (typeof SCHEDULE_RUN_STATUSES)[number];
