import { and, desc, eq, lt } from "drizzle-orm";
import type { Database } from "../../drizzle";
import { ConflictError, NotFoundError } from "../../shared/domain-error";
import {
  SCHEDULE_DEFINITIONS,
  type ScheduleDefinition,
  type ScheduleHandler,
  type ScheduleResult,
} from "./definitions";
import { scheduleRuns, schedules } from "./schema";

export type ScheduleRun = {
  startedAt: string;
  finishedAt: string | null;
  status: string;
  items: number | null;
  dryRun: boolean;
  error: string | null;
};

export type ScheduleView = {
  id: string;
  definition: string;
  label: string | null;
  description: string;
  pattern: string;
  paused: boolean;
  dryRun: boolean;
  /** `unavailable` means the definition exists but has no handler — visible, not fatal. */
  available: boolean;
  lastRun: ScheduleRun | null;
};

export type ScheduleService = {
  list(): Promise<{ schedules: ScheduleView[]; definitions: ScheduleDefinition[] }>;
  create(input: { definition: string; pattern: string; label?: string; actorId: string }): Promise<ScheduleView>;
  remove(id: string, actorId: string): Promise<void>;
  setPaused(id: string, paused: boolean, actorId: string): Promise<void>;
  setPattern(id: string, pattern: string, actorId: string): Promise<void>;
  setDryRun(id: string, dryRun: boolean, actorId: string): Promise<void>;
  runs(id: string, limit?: number): Promise<ScheduleRun[]>;
  execute(id: string): Promise<ScheduleResult>;
  /** Creates one default schedule per definition that has none, so a capability works out of the box. */
  ensureDefaults(): Promise<number>;
};

const CRON_FIELDS = 5;

function assertPattern(pattern: string): string {
  const trimmed = pattern.trim();
  // Anything but 5 fields is a schedule that silently never fires; refusing it here is the only place that can.
  if (trimmed.split(/\s+/).length !== CRON_FIELDS) {
    throw new ConflictError("Pattern must be a 5-field cron expression", { pattern });
  }
  return trimmed;
}

export function createScheduleService(deps: {
  db: Database;
  handlers: Record<string, ScheduleHandler>;
  onMissingHandler?: (name: string, reason: string) => void;
}): ScheduleService {
  const { db, handlers } = deps;

  for (const definition of SCHEDULE_DEFINITIONS) {
    if (!handlers[definition.name]) {
      // Not fatal on purpose: one misconfigured schedule must not stop tenant traffic. It stays visible instead.
      deps.onMissingHandler?.(definition.name, "no handler registered for this definition");
    }
  }

  const definitionOf = (name: string): ScheduleDefinition => {
    const definition = SCHEDULE_DEFINITIONS.find((item) => item.name === name);
    if (!definition) throw new NotFoundError("Schedule definition", name);
    return definition;
  };

  async function rowOf(id: string) {
    const [row] = await db.select().from(schedules).where(eq(schedules.id, id));
    if (!row) throw new NotFoundError("Schedule", id);
    return row;
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

  function toView(row: typeof schedules.$inferSelect, lastRun: ScheduleRun | null): ScheduleView {
    return {
      id: row.id,
      definition: row.definition,
      label: row.label,
      description:
        SCHEDULE_DEFINITIONS.find((item) => item.name === row.definition)?.description ?? "",
      pattern: row.pattern,
      paused: row.paused === "true",
      dryRun: row.dryRun === "true",
      available: Boolean(handlers[row.definition]),
      lastRun,
    };
  }

  return {
    async list() {
      const rows = await db.select().from(schedules).orderBy(desc(schedules.createdAt));
      const recent = await db
        .select()
        .from(scheduleRuns)
        .orderBy(desc(scheduleRuns.startedAt))
        .limit(400);

      const latest = new Map<string, ScheduleRun>();
      for (const run of recent) {
        if (run.scheduleId && !latest.has(run.scheduleId)) latest.set(run.scheduleId, toRun(run));
      }

      return {
        schedules: rows.map((row) => toView(row, latest.get(row.id) ?? null)),
        definitions: SCHEDULE_DEFINITIONS,
      };
    },

    async create({ definition, pattern, label, actorId }) {
      definitionOf(definition);
      const [row] = await db
        .insert(schedules)
        .values({
          definition,
          pattern: assertPattern(pattern),
          label: label?.trim() || null,
          createdBy: actorId,
        })
        .returning();
      if (!row) throw new Error("could not create the schedule");
      return toView(row, null);
    },

    async remove(id) {
      await rowOf(id);
      // Runs keep their own copy of `definition`, so history survives the schedule that produced it.
      await db.delete(schedules).where(eq(schedules.id, id));
    },

    async setPaused(id, paused) {
      await rowOf(id);
      await db.update(schedules).set({ paused: paused ? "true" : "false" }).where(eq(schedules.id, id));
    },

    async setPattern(id, pattern) {
      await rowOf(id);
      await db.update(schedules).set({ pattern: assertPattern(pattern) }).where(eq(schedules.id, id));
    },

    async setDryRun(id, dryRun) {
      await rowOf(id);
      await db.update(schedules).set({ dryRun: dryRun ? "true" : "false" }).where(eq(schedules.id, id));
    },

    async runs(id, limit = 50) {
      const row = await rowOf(id);
      const rows = await db
        .select()
        .from(scheduleRuns)
        .where(eq(scheduleRuns.scheduleId, row.id))
        .orderBy(desc(scheduleRuns.startedAt))
        .limit(Math.min(Math.max(limit, 1), 200));
      return rows.map(toRun);
    },

    async execute(id) {
      const row = await rowOf(id);
      if (row.paused === "true") throw new ConflictError(`Schedule ${id} is paused`, { id });

      const handler = handlers[row.definition];
      if (!handler) {
        await db.insert(scheduleRuns).values({
          scheduleId: row.id,
          definition: row.definition,
          status: "skipped",
          dryRun: row.dryRun,
          items: 0,
          finishedAt: new Date(),
          error: "no handler registered for this definition",
        });
        throw new ConflictError(`Definition ${row.definition} has no handler`, { id });
      }

      const dryRun = row.dryRun === "true";
      const [run] = await db
        .insert(scheduleRuns)
        .values({ scheduleId: row.id, definition: row.definition, status: "running", dryRun: row.dryRun })
        .returning();
      if (!run) throw new Error("could not record the run");

      try {
        const result = await handler({ dryRun });
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

    async ensureDefaults() {
      const existing = await db.select().from(schedules);
      let created = 0;
      for (const definition of SCHEDULE_DEFINITIONS) {
        if (existing.some((row) => row.definition === definition.name)) continue;
        await db.insert(schedules).values({
          definition: definition.name,
          pattern: definition.defaultPattern,
          dryRun: definition.dryRunDefault ? "true" : "false",
          isDefault: "true",
          createdBy: "system",
        });
        created += 1;
      }
      return created;
    },
  };
}

/** Marks runs left in `running` (the process died mid-run) so history does not claim work is still happening. */
export async function failStaleRuns(db: Database, olderThanMs = 6 * 60 * 60 * 1000): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const rows = await db
    .update(scheduleRuns)
    .set({ status: "failed", error: "run did not finish (process stopped)", finishedAt: new Date() })
    .where(and(eq(scheduleRuns.status, "running"), lt(scheduleRuns.startedAt, cutoff)))
    .returning({ id: scheduleRuns.id });
  return rows.length;
}
