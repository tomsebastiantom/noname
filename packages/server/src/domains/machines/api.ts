import { Hono } from "hono";
import type { MachineEngine } from "./ports";
import { registerMachineDefinitionRoutes } from "./routes/definitions";
import type { MachineRouteDeps } from "./routes/deps";
import { registerMachineInstanceRoutes } from "./routes/instances";

export function createMachineRoutes(engine: MachineEngine) {
  const routes = new Hono();
  const deps: MachineRouteDeps = { engine };

  registerMachineDefinitionRoutes(routes, deps);
  registerMachineInstanceRoutes(routes, deps);

  return routes;
}
