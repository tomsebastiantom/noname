import { closeBullmqQueue, getBullmqQueue } from "../../shared/bullmq-queue";
import { BULLMQ_QUEUES } from "../../shared/bullmq-queues";
import type { AnalyticsEventDTO } from "./ports";

export type AnalyticsJobData = AnalyticsEventDTO;

export function getAnalyticsQueue() {
  return getBullmqQueue<AnalyticsJobData>(BULLMQ_QUEUES.ANALYTICS, {
    defaultJobOptions: {
      // A single attempt made ingest at-most-once: any ClickHouse error dropped the
      // event silently. Retry with backoff before giving up.
      attempts: 5,
      backoff: { type: "exponential", delay: 1_000 },
    },
  });
}

export async function closeAnalyticsQueue(): Promise<void> {
  await closeBullmqQueue(BULLMQ_QUEUES.ANALYTICS);
}
