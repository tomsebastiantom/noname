import type { Database } from "../../drizzle";
import type { TenantSettingsService } from "../documents/ports";
import { createPostgresMachineStorage } from "./adapters/postgres";
import { createMachineRoutes } from "./api";
import { createMachineEngine, type MachineEngineHooks, registerGuard } from "./engine";
import type { Guard, MachineStorage } from "./ports";
import { createTransitionRelay } from "./transition-relay";

export interface MachineDomainDeps {
  db: Database;
  storage?: MachineStorage;
  guards?: Record<string, Guard>;
  hooks?: MachineEngineHooks;
  tenantSettings: Pick<TenantSettingsService, "get">;
}

export function createMachineDomain(deps: MachineDomainDeps) {
  const storage = deps.storage ?? createPostgresMachineStorage(deps.db);
  const engine = createMachineEngine(storage, deps.hooks ?? {});

  if (deps.guards) {
    for (const [name, guard] of Object.entries(deps.guards)) {
      registerGuard(name, guard);
    }
  }

  const routes = createMachineRoutes(engine, deps.tenantSettings);
  /**
   * Republisher for committed-but-undelivered transitions. Not started here: the caller decides,
   * because it should run wherever background work runs (and must be stopped on shutdown).
   */
  const relay = createTransitionRelay(storage);
  return { storage, engine, routes, relay };
}
