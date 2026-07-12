import { Queue } from "bullmq";
import { getRedisConnection } from "../../shared/redis";

export interface CatalogBuildJobData {
  buildId: string;
  tenantId: string;
  name: string;
  source: string;
  traceparent?: string;
  tracestate?: string;
}

let catalogBuildQueue: Queue<CatalogBuildJobData> | null = null;

export function getCatalogBuildQueue(): Queue<CatalogBuildJobData> {
  if (!catalogBuildQueue) {
    catalogBuildQueue = new Queue<CatalogBuildJobData>("catalog-builds", {
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
