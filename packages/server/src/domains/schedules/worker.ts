import { Worker } from "bullmq";
import { BULLMQ_QUEUES } from "../../shared/bullmq-queues";
import { registerBullmqWorker } from "../../shared/bullmq-workers";
import { getRedisConnection } from "../../shared/redis";
import { workerConcurrency, workersEnabled } from "../../shared/worker-runtime";
import { getScheduleQueue } from "./queue";
import type { ScheduleService } from "./service";

/**
 * Registers one repeatable job per **schedule** (not per definition), keyed by schedule id.
 *
 * Two schedules of the same definition therefore keep independent cadences, and a restart cannot double either:
 * `upsertJobScheduler` replaces the same key. A paused schedule is removed from the queue rather than left to fire
 * and refuse, so the history is not padded with refusals.
 */
export async function registerSchedules(schedules: ScheduleService): Promise<void> {
  await schedules.ensureDefaults();

  const queue = getScheduleQueue();
  const { schedules: rows } = await schedules.list();
  const wanted = new Set<string>();

  for (const row of rows) {
    if (row.paused || !row.available) continue;
    wanted.add(row.id);
    await queue.upsertJobScheduler(
      `schedule:${row.id}`,
      { pattern: row.pattern },
      {
        name: row.id,
        data: { scheduleId: row.id },
        opts: { removeOnComplete: 50, removeOnFail: 50 },
      },
    );
  }

  // Remove schedulers whose schedule was deleted, paused, or whose definition lost its handler.
  const existing = await queue.getJobSchedulers();
  for (const scheduler of existing) {
    const key = String(scheduler.key ?? "");
    const scheduleId = key.replace(/^schedule:/, "");
    if (scheduleId && !wanted.has(scheduleId)) {
      await queue.removeJobScheduler(key).catch(() => undefined);
    }
  }
}

export function startScheduleWorker(schedules: ScheduleService): Worker | null {
  if (!workersEnabled()) return null;

  const worker = new Worker<{ scheduleId: string }>(
    BULLMQ_QUEUES.SCHEDULES,
    async (job) => {
      await schedules.execute(job.data.scheduleId);
    },
    { connection: getRedisConnection(), concurrency: workerConcurrency("SCHEDULE_CONCURRENCY", 2) },
  );

  registerBullmqWorker(worker);
  return worker;
}
