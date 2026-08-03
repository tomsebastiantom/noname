import { Hono } from "hono";
import type { AgentService } from "./ports";
import type { AgentRouteDeps } from "./routes/deps";
import { registerAgentRegistryRoutes } from "./routes/registry";
import { registerAgentTaskRoutes } from "./routes/tasks";

export function createAgentRoutes(deps: AgentRouteDeps) {
  const routes = new Hono();

  registerAgentTaskRoutes(routes, { service: deps.service });
  if (deps.registry) {
    registerAgentRegistryRoutes(routes, deps.registry);
  }

  return routes;
}

export type { AgentService };
