import { Hono } from "hono";
import type { FlagService } from "./ports";
import { registerFlagCrudRoutes } from "./routes/crud";
import type { FlagRouteDeps } from "./routes/deps";
import { registerFlagEvaluateRoutes } from "./routes/evaluate";
import { registerFlagStreamRoutes } from "./routes/stream";

export function createFlagRoutes(service: FlagService) {
  const routes = new Hono();
  const deps: FlagRouteDeps = { service };

  registerFlagEvaluateRoutes(routes, deps);
  registerFlagStreamRoutes(routes);
  registerFlagCrudRoutes(routes, deps);

  return routes;
}
