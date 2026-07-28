import { Queue } from "bullmq";
import { BULLMQ_QUEUES } from "../../shared/bullmq-queues";
import { getRedisConnection } from "../../shared/redis";
import type { AnalyticsEventDTO } from "./ports";

export type AnalyticsJobData = AnalyticsEventDTO;

let analyticsQueue: Queue<AnalyticsJobData> | null = null;

export function getAnalyticsQueue(): Queue<AnalyticsJobData> {
  if (!analyticsQueue) {
    analyticsQueue = new Queue<AnalyticsJobData>(BULLMQ_QUEUES.ANALYTICS, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 1,
      },
    });
  }
  return analyticsQueue;
}

export async function closeAnalyticsQueue(): Promise<void> {
  if (analyticsQueue) {
    await analyticsQueue.close();
    analyticsQueue = null;
  }
}
