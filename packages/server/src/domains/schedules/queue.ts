import { closeBullmqQueue, getBullmqQueue } from "../../shared/bullmq-queue";
import { BULLMQ_QUEUES } from "../../shared/bullmq-queues";

export type ScheduleJobData = { name: string };

/**
 * One queue for every schedule, not one queue per job.
 *
 * `jobId` is the schedule name, so a duplicate registration (another replica, a restart) collapses into the same
 * schedule instead of doubling the cadence — which is the failure mode that makes people distrust timers.
 */
export function getScheduleQueue() {
  return getBullmqQueue<ScheduleJobData>(BULLMQ_QUEUES.SCHEDULES);
}

export async function closeScheduleQueue(): Promise<void> {
  await closeBullmqQueue(BULLMQ_QUEUES.SCHEDULES);
}
