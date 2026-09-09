import { closeBullmqQueue, getBullmqQueue } from "../../shared/bullmq-queue";
import { BULLMQ_QUEUES } from "../../shared/bullmq-queues";
import type { WebhookOutboundJobData } from "./ports";

export function getWebhookOutboundQueue() {
  return getBullmqQueue<WebhookOutboundJobData>(BULLMQ_QUEUES.WEBHOOK_OUTBOUND, {
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 200 },
    },
  });
}

export async function closeWebhookOutboundQueue(): Promise<void> {
  await closeBullmqQueue(BULLMQ_QUEUES.WEBHOOK_OUTBOUND);
}
