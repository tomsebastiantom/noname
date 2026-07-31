import { closeBullmqQueue, getBullmqQueue } from "../../shared/bullmq-queue";
import { BULLMQ_QUEUES } from "../../shared/bullmq-queues";

export interface CatalogBuildJobData {
  buildId: string;
  orgId: string;
  name: string;
  source: string;
  traceparent?: string;
  tracestate?: string;
}

export function getCatalogBuildQueue() {
  return getBullmqQueue<CatalogBuildJobData>(BULLMQ_QUEUES.CATALOG);
}

export async function closeCatalogBuildQueue(): Promise<void> {
  await closeBullmqQueue(BULLMQ_QUEUES.CATALOG);
}
