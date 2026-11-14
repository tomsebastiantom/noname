import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * A **schedule** is an instance of a definition: "run this capability at this cadence".
 *
 * The definition (`definitions.ts`) is code and names a handler; the schedule is data and only chooses *when*.
 * Many schedules may share one definition — a daily retention sweep and a weekly one with a longer window are two
 * rows, not two code changes. Creating one is therefore safe: it cannot introduce behaviour, only timing.
 */
export const schedules = pgTable(
  "schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Must exist in `SCHEDULE_DEFINITIONS`; validated on write so a schedule can never point at nothing. */
    definition: text("definition").notNull(),
    /** Operator-facing name, so two schedules of one definition are distinguishable in the list. */
    label: text("label"),
    /** 5-field cron. */
    pattern: text("pattern").notNull(),
    paused: text("paused").notNull().default("false"),
    /** New schedules start dry: a schedule must be trusted deliberately before it can change data. */
    dryRun: text("dry_run").notNull().default("true"),
    /** Set for the schedule created automatically so a definition works out of the box. */
    isDefault: text("is_default").notNull().default("false"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by"),
  },
  (table) => [index("schedules_definition_idx").on(table.definition)],
);

/**
 * One row per execution attempt — the history an operator reads.
 *
 * `definition` is copied in on purpose: deleting a schedule must not erase what it did, and the history stays
 * readable without joining a row that no longer exists.
 */
export const scheduleRuns = pgTable(
  "schedule_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scheduleId: uuid("schedule_id"),
    definition: text("definition").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: text("status").notNull().default("running"),
    items: integer("items"),
    dryRun: text("dry_run").notNull().default("true"),
    error: text("error"),
  },
  (table) => [index("schedule_runs_definition_started_idx").on(table.definition, table.startedAt)],
);

export const SCHEDULE_RUN_STATUSES = ["running", "ok", "failed", "skipped"] as const;
export type ScheduleRunStatus = (typeof SCHEDULE_RUN_STATUSES)[number];
