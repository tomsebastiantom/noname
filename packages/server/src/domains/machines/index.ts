import type { Database } from "../../drizzle";
import { createPostgresMachineStorage } from "./adapters/postgres";
import { createMachineRoutes } from "./api";
import { createMachineEngine, registerGuard, type MachineEngineHooks } from "./engine";
import type { Guard, MachineStorage } from "./ports";

export interface MachineDomainDeps {
  db: Database;
  storage?: MachineStorage;
  guards?: Record<string, Guard>;
  hooks?: MachineEngineHooks;
}

export function createMachineDomain(deps: MachineDomainDeps) {
  const storage = deps.storage ?? createPostgresMachineStorage(deps.db);
  const engine = createMachineEngine(storage, deps.hooks ?? {});

  if (deps.guards) {
    for (const [name, guard] of Object.entries(deps.guards)) {
      registerGuard(name, guard);
    }
  }

  const routes = createMachineRoutes(engine);
  return { storage, engine, routes };
}
