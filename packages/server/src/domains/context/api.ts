import { Hono } from "hono";
import type { ContextService } from "./ports";
import type { ContextRouteDeps } from "./routes/deps";
import { registerContextResolveRoutes } from "./routes/resolve";
import { registerContextSegmentRoutes } from "./routes/segments";

export function createContextRoutes(service: ContextService) {
  const routes = new Hono();
  const deps: ContextRouteDeps = { service };

  registerContextResolveRoutes(routes, deps);
  registerContextSegmentRoutes(routes, deps);

  return routes;
}
