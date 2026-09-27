import { createClickHouseAnalyticsStorage, ensureClickHouseTable } from "./adapters/clickhouse";
import { createAnalyticsRoutes } from "./api";
import { registerAnalyticsListeners } from "./listeners";
import { getAnalyticsQueue } from "./queue";
import { createReplayBlobStorage } from "./replay-storage";
import type { AnalyticsRouteDeps } from "./routes/deps";
import { createAnalyticsService } from "./service";
import { startAnalyticsWorker } from "./worker";

export async function createAnalyticsDomain(
  getAudiencePerformance: AnalyticsRouteDeps["getAudiencePerformance"],
) {
  await ensureClickHouseTable();

  const storage = createClickHouseAnalyticsStorage();
  const queue = getAnalyticsQueue();
  const service = createAnalyticsService(storage, queue);
  const replayStorage = createReplayBlobStorage();
  const routes = createAnalyticsRoutes(service, replayStorage, getAudiencePerformance);
  const worker = startAnalyticsWorker(storage);

  registerAnalyticsListeners(service);

  return { storage, service, routes, worker };
}
