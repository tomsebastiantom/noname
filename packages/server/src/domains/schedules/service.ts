import { and, desc, eq, lt } from "drizzle-orm";
import type { Database } from "../../drizzle";
import { ConflictError, NotFoundError } from "../../shared/domain-error";
import {
  SCHEDULE_DEFINITIONS,
  type ScheduleDefinition,
  type ScheduleHandler,
  type ScheduleResult,
} from "./definitions";
import { scheduleRuns, scheduleState } from "./schema";

export type ScheduleRun = {
  startedAt: string;
  finishedAt: string | null;
  status: string;
  items: number | null;
  dryRun: boolean;
  error: string | null;
};

export type ScheduleStatus = {
  name: string;
  description: string;
  /** Effective cron: the override when set, otherwise the definition's default. */
  pattern: string;
  overridden: boolean;
  paused: boolean;
  dryRun: boolean;
  /** `unavailable` means the definition exists but its handler is missing — visible, not fatal. */
  available: boolean;
  lastRun: ScheduleRun | null;
};

export type ScheduleService = {
  list(): Promise<ScheduleStatus[]>;
  setPaused(name: string, paused: boolean, actorId: string): Promise<void>;
  setPattern(name: string, pattern: string | null, actorId: string): Promise<void>;
  setDryRun(name: string, dryRun: boolean, actorId: string): Promise<void>;
  runs(name: string, limit?: number): Promise<ScheduleRun[]>;
  /** Runs one schedule now and records the attempt, whatever the outcome. */
  execute(name: string): Promise<ScheduleResult>;
};

type StateRow = typeof scheduleState.$inferSelect;

export function createScheduleService(deps: {
  db: Database;
  handlers: Record<string, ScheduleHandler>;
  /** Called on every start so a missing handler is reported once, loudly, without taking the process down. */
  onMissingHandler?: (name: string, reason: string) => void;
}): ScheduleService {
  const { db, handlers } = deps;

  for (const definition of SCHEDULE_DEFINITIONS) {
    if (!handlers[definition.name]) {
      // Deliberately not fatal: one misconfigured schedule must not stop tenant traffic. It stays visible instead —
      // missing from the console list would be the dangerous failure.
      deps.onMissingHandler?.(definition.name, "no handler registered for this definition");
    }
  }

  const definitionOf = (name: string): ScheduleDefinition => {
    const definition = SCHEDULE_DEFINITIONS.find((item) => item.name === name);
    if (!definition) throw new NotFoundError("Schedule", name);
    return definition;
  };

  async function stateOf(name: string): Promise<StateRow | null> {
    const [row] = await db.select().from(scheduleState).where(eq(scheduleState.name, name));
    return row ?? null;
  }

  async function effective(name: string) {
    const definition = definitionOf(name);
    const state = await stateOf(name);
    return {
      definition,
      pattern: state?.pattern ?? definition.defaultPattern,
      overridden: Boolean(state?.pattern),
      paused: state?.paused === "true",
      dryRun: state?.dryRun ? state.dryRun === "true" : definition.dryRunDefault,
    };
  }

  async function upsertState(
    name: string,
    patch: { pattern?: string | null; paused?: boolean; dryRun?: boolean; actorId: string },
  ): Promise<void> {
    definitionOf(name);
    const current = await stateOf(name);
    const next = {
      name,
      pattern: patch.pattern === undefined ? (current?.pattern ?? null) : patch.pattern,
      paused: patch.paused === undefined ? (current?.paused ?? "false") : patch.paused ? "true" : "false",
      dryRun:
        patch.dryRun === undefined ? (current?.dryRun ?? null) : patch.dryRun ? "true" : "false",
      updatedAt: new Date(),
      updatedBy: patch.actorId,
    };
    await db
      .insert(scheduleState)
      .values(next)
      .onConflictDoUpdate({ target: scheduleState.name, set: next });
  }

  function toRun(row: typeof scheduleRuns.$inferSelect): ScheduleRun {
    return {
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
      status: row.status,
      items: row.items,
      dryRun: row.dryRun === "true",
      error: row.error,
    };
  }

  return {
    async list() {
      const recent = await db
        .select()
        .from(scheduleRuns)
        .orderBy(desc(scheduleRuns.startedAt))
        .limit(300);
      const latest = new Map<string, (typeof recent)[number]>();
      for (const row of recent) if (!latest.has(row.name)) latest.set(row.name, row);

      return Promise.all(
        SCHEDULE_DEFINITIONS.map(async (definition) => {
          const state = await effective(definition.name);
          const run = latest.get(definition.name);
          return {
            name: definition.name,
            description: definition.description,
            pattern: state.pattern,
            overridden: state.overridden,
            paused: state.paused,
            dryRun: state.dryRun,
            available: Boolean(handlers[definition.name]),
            lastRun: run ? toRun(run) : null,
          };
        }),
      );
    },

    setPaused: (name, paused, actorId) => upsertState(name, { paused, actorId }),

    async setPattern(name, pattern, actorId) {
      // Anything other than 5 fields is a schedule that silently never fires; refuse it here.
      if (pattern !== null && pattern.trim().split(/\s+/).length !== 5) {
        throw new ConflictError(`Pattern for ${name} must be a 5-field cron expression`, { pattern });
      }
      await upsertState(name, { pattern: pattern === null ? null : pattern.trim(), actorId });
    },

    setDryRun: (name, dryRun, actorId) => upsertState(name, { dryRun, actorId }),

    async runs(name, limit = 50) {
      definitionOf(name);
      const rows = await db
        .select()
        .from(scheduleRuns)
        .where(eq(scheduleRuns.name, name))
        .orderBy(desc(scheduleRuns.startedAt))
        .limit(Math.min(Math.max(limit, 1), 200));
      return rows.map(toRun);
    },

    async execute(name) {
      const state = await effective(name);
      if (state.paused) throw new ConflictError(`Schedule ${name} is paused`, { name });

      const handler = handlers[name];
      if (!handler) {
        // Recorded as a skipped run so the gap is visible in history rather than absent from it.
        await db.insert(scheduleRuns).values({
          name,
          status: "skipped",
          dryRun: state.dryRun ? "true" : "false",
          items: 0,
          finishedAt: new Date(),
          error: "no handler registered for this definition",
        });
        throw new ConflictError(`Schedule ${name} has no handler`, { name });
      }

      const [run] = await db
        .insert(scheduleRuns)
        .values({ name, status: "running", dryRun: state.dryRun ? "true" : "false" })
        .returning();
      if (!run) throw new Error("could not record the run");

      try {
        const result = await handler({ dryRun: state.dryRun });
        await db
          .update(scheduleRuns)
          .set({
            status: "ok",
            items: result.items,
            dryRun: result.dryRun ? "true" : "false",
            finishedAt: new Date(),
          })
          .where(eq(scheduleRuns.id, run.id));
        return result;
      } catch (cause) {
        await db
          .update(scheduleRuns)
          .set({
            status: "failed",
            error: cause instanceof Error ? cause.message : String(cause),
            finishedAt: new Date(),
          })
          .where(eq(scheduleRuns.id, run.id));
        throw cause;
      }
    },
  };
}

/** Marks runs left in `running` (the process died mid-run) so the history does not claim work is still happening. */
export async function failStaleRuns(db: Database, olderThanMs = 6 * 60 * 60 * 1000): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const rows = await db
    .update(scheduleRuns)
    .set({ status: "failed", error: "run did not finish (process stopped)", finishedAt: new Date() })
    .where(and(eq(scheduleRuns.status, "running"), lt(scheduleRuns.startedAt, cutoff)))
    .returning({ id: scheduleRuns.id });
  return rows.length;
}
