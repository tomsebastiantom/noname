/**
 * Every scheduled job the platform runs — **defined here, in code**.
 *
 * Why code and not rows: a schedule is behaviour, and behaviour belongs in review. A definition added in a PR is
 * visible, diffable, and impossible to drift from its handler; a row created at runtime is neither.
 *
 * The runtime knobs an operator legitimately needs — pause, and "run it at 04:00 instead" — live in
 * `schedule_state`, and an override is cleared by deleting it, which restores the default below.
 */
export type ScheduleDefinition = {
  /** Stable id: used as the BullMQ jobId and as the audit subject. Never change it casually. */
  name: string;
  description: string;
  /** Cron expression (5 fields). The state table may override it at runtime. */
  defaultPattern: string;
  /**
   * Handlers start in dry-run unless explicitly told otherwise. A new schedule must not be able to destroy data
   * merely by being deployed.
   */
  dryRunDefault: boolean;
};

export const SCHEDULE_DEFINITIONS: ScheduleDefinition[] = [
  {
    name: "tenant-retention-purge",
    description:
      "Purge tenants that were soft-deleted longer than RETENTION_DAYS: removes inventory and provisioning rows and deletes the IdP org, keeping one platform audit row per tenant.",
    defaultPattern: "0 3 * * *",
    dryRunDefault: true,
  },
];

/** What a handler receives: the switch an operator controls, plus nothing else. */
export type ScheduleContext = { dryRun: boolean };

/** What a handler reports back; `items` is whatever "how much did this touch" means for that job. */
export type ScheduleResult = { items: number; dryRun: boolean };

export type ScheduleHandler = (ctx: ScheduleContext) => Promise<ScheduleResult>;
