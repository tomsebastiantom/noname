import { createClickHouseAnalyticsStorage, ensureClickHouseTable } from "./adapters/clickhouse";
import { createAnalyticsRoutes } from "./api";
import { registerAnalyticsListeners } from "./listeners";
import { getAnalyticsQueue } from "./queue";
import { createAnalyticsService } from "./service";
import { startAnalyticsWorker } from "./worker";

export async function createAnalyticsDomain() {
  await ensureClickHouseTable();

  const storage = createClickHouseAnalyticsStorage();
  const queue = getAnalyticsQueue();
  const service = createAnalyticsService(storage, queue);
  const routes = createAnalyticsRoutes(service);
  const worker = startAnalyticsWorker(storage);

  registerAnalyticsListeners(service);

  return { storage, service, routes, worker };
}
