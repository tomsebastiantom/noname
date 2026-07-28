import { Queue } from "bullmq";
import { BULLMQ_QUEUES } from "../../shared/bullmq-queues";
import { getRedisConnection } from "../../shared/redis";

export interface AgentJobData {
  taskId: string;
  orgId: string;
  type: string;
  prompt: string;
  input: Record<string, unknown>;
  traceparent?: string;
  tracestate?: string;
}

let agentQueue: Queue<AgentJobData> | null = null;

export function getAgentQueue(): Queue<AgentJobData> {
  if (!agentQueue) {
    agentQueue = new Queue<AgentJobData>(BULLMQ_QUEUES.AGENT, { connection: getRedisConnection() });
  }
  return agentQueue;
}

export async function closeQueue(): Promise<void> {
  if (agentQueue) {
    await agentQueue.close();
    agentQueue = null;
  }
}
