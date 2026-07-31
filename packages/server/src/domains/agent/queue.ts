import { closeBullmqQueue, getBullmqQueue } from "../../shared/bullmq-queue";
import { BULLMQ_QUEUES } from "../../shared/bullmq-queues";

export interface AgentJobData {
  taskId: string;
  orgId: string;
  type: string;
  prompt: string;
  input: Record<string, unknown>;
  traceparent?: string;
  tracestate?: string;
}

export function getAgentQueue() {
  return getBullmqQueue<AgentJobData>(BULLMQ_QUEUES.AGENT);
}

export async function closeQueue(): Promise<void> {
  await closeBullmqQueue(BULLMQ_QUEUES.AGENT);
}
