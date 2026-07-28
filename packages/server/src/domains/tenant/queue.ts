import { Queue } from "bullmq";
import { BULLMQ_QUEUES } from "../../shared/bullmq-queues";
import { getRedisConnection } from "../../shared/redis";

export interface CatalogBuildJobData {
  buildId: string;
  orgId: string;
  name: string;
  source: string;
  traceparent?: string;
  tracestate?: string;
}

let catalogBuildQueue: Queue<CatalogBuildJobData> | null = null;

export function getCatalogBuildQueue(): Queue<CatalogBuildJobData> {
  if (!catalogBuildQueue) {
    catalogBuildQueue = new Queue<CatalogBuildJobData>(BULLMQ_QUEUES.CATALOG, {
      connection: getRedisConnection(),
    });
  }
  return catalogBuildQueue;
}

export async function closeCatalogBuildQueue(): Promise<void> {
  if (catalogBuildQueue) {
    await catalogBuildQueue.close();
    catalogBuildQueue = null;
  }
}
