import { Hono } from "hono";
import type { TenantSettingsService } from "../documents/ports";
import type { MachineEngine } from "./ports";
import { registerMachineDefinitionRoutes } from "./routes/definitions";
import type { MachineRouteDeps } from "./routes/deps";
import { registerMachineInstanceRoutes } from "./routes/instances";

export function createMachineRoutes(
  engine: MachineEngine,
  tenantSettings: Pick<TenantSettingsService, "get">,
) {
  const routes = new Hono();
  const deps: MachineRouteDeps = { engine, tenantSettings };

  registerMachineDefinitionRoutes(routes, deps);
  registerMachineInstanceRoutes(routes, deps);

  return routes;
}
