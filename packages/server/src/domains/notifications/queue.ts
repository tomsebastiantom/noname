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

export function getEmailOutboundQueue() {
  return getBullmqQueue<EmailOutboundJobData>(BULLMQ_QUEUES.EMAIL_OUTBOUND);
}

export async function closeEmailOutboundQueue(): Promise<void> {
  await closeBullmqQueue(BULLMQ_QUEUES.EMAIL_OUTBOUND);
}
