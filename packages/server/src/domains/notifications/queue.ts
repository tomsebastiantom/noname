import { closeBullmqQueue, getBullmqQueue } from "../../shared/bullmq-queue";
import { BULLMQ_QUEUES } from "../../shared/bullmq-queues";

export interface EmailOutboundJobData {
  deliveryId: string;
  orgId: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  userId?: string;
}

const EMAIL_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 5000 },
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 200 },
};

export function getEmailOutboundQueue() {
  return getBullmqQueue<EmailOutboundJobData>(BULLMQ_QUEUES.EMAIL_OUTBOUND, {
    defaultJobOptions: EMAIL_JOB_OPTIONS,
  });
}

export async function closeEmailOutboundQueue(): Promise<void> {
  await closeBullmqQueue(BULLMQ_QUEUES.EMAIL_OUTBOUND);
}
