import { Hono } from "hono";
import type { AnalyticsService } from "./ports";
import type { ReplayBlobStorage } from "./replay-storage";
import type { AnalyticsRouteDeps } from "./routes/deps";
import { registerAnalyticsIngestRoutes } from "./routes/ingest";
import { registerAnalyticsQueryRoutes } from "./routes/query";
import { registerAnalyticsReplayRoutes } from "./routes/replay";

export function createAnalyticsRoutes(
  service: AnalyticsService,
  replayStorage: ReplayBlobStorage | null = null,
) {
  const routes = new Hono();
  const deps: AnalyticsRouteDeps = { service, replayStorage };

  registerAnalyticsIngestRoutes(routes, deps);
  registerAnalyticsQueryRoutes(routes, deps);
  registerAnalyticsReplayRoutes(routes, deps);

  return routes;
}
