import { closeBullmqQueue, getBullmqQueue } from "../../shared/bullmq-queue";
import { BULLMQ_QUEUES } from "../../shared/bullmq-queues";

export type ScheduleJobData = { scheduleId: string };

/**
 * One queue for every schedule.
 *
 * The scheduler key is `schedule:<id>`, so two schedules of the same definition — or two API replicas registering the
 * same schedule — collapse onto the same key instead of multiplying the cadence.
 */
export function getScheduleQueue() {
  return getBullmqQueue<ScheduleJobData>(BULLMQ_QUEUES.SCHEDULES);
}

export async function closeScheduleQueue(): Promise<void> {
  await closeBullmqQueue(BULLMQ_QUEUES.SCHEDULES);
}
