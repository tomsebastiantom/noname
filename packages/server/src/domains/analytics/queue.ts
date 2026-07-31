import { closeBullmqQueue, getBullmqQueue } from "../../shared/bullmq-queue";
import { BULLMQ_QUEUES } from "../../shared/bullmq-queues";
import type { AnalyticsEventDTO } from "./ports";

export type AnalyticsJobData = AnalyticsEventDTO;

export function getAnalyticsQueue() {
  return getBullmqQueue<AnalyticsJobData>(BULLMQ_QUEUES.ANALYTICS, {
    defaultJobOptions: { attempts: 1 },
  });
}

export async function closeAnalyticsQueue(): Promise<void> {
  await closeBullmqQueue(BULLMQ_QUEUES.ANALYTICS);
}
