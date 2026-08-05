import { closeBullmqQueue, getBullmqQueue } from "../../shared/bullmq-queue";
import { BULLMQ_QUEUES } from "../../shared/bullmq-queues";
import type { WebhookInboundJobData } from "./ports";

export function getWebhookInboundQueue() {
  return getBullmqQueue<WebhookInboundJobData>(BULLMQ_QUEUES.WEBHOOK_INBOUND, {
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 3000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 200 },
    },
  });
}

export async function closeWebhookInboundQueue(): Promise<void> {
  await closeBullmqQueue(BULLMQ_QUEUES.WEBHOOK_INBOUND);
}
