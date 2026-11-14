import { Worker } from "bullmq";
import { BULLMQ_QUEUES } from "../../shared/bullmq-queues";
import { registerBullmqWorker } from "../../shared/bullmq-workers";
import { getRedisConnection } from "../../shared/redis";
import { workerConcurrency, workersEnabled } from "../../shared/worker-runtime";
import { SCHEDULE_DEFINITIONS } from "./definitions";
import { getScheduleQueue } from "./queue";
import type { ScheduleService } from "./service";

/**
 * Registers every definition as a repeatable job and drains the queue.
 *
 * Registration is idempotent by `jobId`: restarting the API ten times leaves one schedule per definition, not ten.
 * A paused schedule is removed from the queue rather than left to fire and refuse — a paused job that wakes up every
 * night only to throw is noise in the history.
 */
export async function registerSchedules(schedules: ScheduleService): Promise<void> {
  const queue = getScheduleQueue();
  const states = await schedules.list();

  for (const state of states) {
    if (!state.available) continue; // definition without a handler: visible in the console, not scheduled

    if (state.paused) {
      await queue.removeJobScheduler(`schedule:${state.name}`).catch(() => undefined);
      continue;
    }

    await queue.upsertJobScheduler(
      `schedule:${state.name}`,
      { pattern: state.pattern },
      { name: state.name, data: { name: state.name }, opts: { removeOnComplete: 100, removeOnFail: 100 } },
    );
  }
}

export function startScheduleWorker(schedules: ScheduleService): Worker | null {
  if (!workersEnabled()) return null;

  const worker = new Worker<{ name: string }>(
    BULLMQ_QUEUES.SCHEDULES,
    async (job) => {
      await schedules.execute(job.data.name);
    },
    { connection: getRedisConnection(), concurrency: workerConcurrency("SCHEDULE_CONCURRENCY", 2) },
  );

  registerBullmqWorker(worker);
  return worker;
}

/** Names registered as repeatables — exposed so the console can show what the queue actually holds. */
export async function scheduledNames(): Promise<string[]> {
  const queue = getScheduleQueue();
  const schedulers = await queue.getJobSchedulers();
  return schedulers.map((scheduler) => String(scheduler.key ?? scheduler.id ?? "")).filter(Boolean);
}

export { SCHEDULE_DEFINITIONS };
