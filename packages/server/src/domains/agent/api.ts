import { Hono } from "hono";
import type { AgentService } from "./ports";
import type { AgentRouteDeps } from "./routes/deps";
import { registerAgentTaskRoutes } from "./routes/tasks";

export function createAgentRoutes(service: AgentService) {
  const routes = new Hono();
  const deps: AgentRouteDeps = { service };

  registerAgentTaskRoutes(routes, deps);

  return routes;
}
