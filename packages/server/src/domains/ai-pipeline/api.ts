import { Hono } from "hono";
import type { AIPipeline } from "./ports";
import type { AIPipelineRouteDeps } from "./routes/deps";
import { registerAIGenerateRoutes } from "./routes/generate";

export function createAIPipelineRoutes(service: AIPipeline) {
  const routes = new Hono();
  const deps: AIPipelineRouteDeps = { service };

  registerAIGenerateRoutes(routes, deps);

  return routes;
}
