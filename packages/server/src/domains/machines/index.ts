import { createMachineRoutes } from "./api";
import { createMachineEngine, registerGuard } from "./engine";
import { createPostgresMachineStorage } from "./adapters/postgres";
import type { MachineStorage, Guard } from "./ports";
import type { Database } from "../../drizzle";

export interface MachineDomainDeps {
  db: Database;
  storage?: MachineStorage;
  guards?: Record<string, Guard>;
}

export function createMachineDomain(deps: MachineDomainDeps) {
  const storage = deps.storage ?? createPostgresMachineStorage(deps.db);
  const engine = createMachineEngine(storage);

  if (deps.guards) {
    for (const [name, guard] of Object.entries(deps.guards)) {
      registerGuard(name, guard);
    }
  }

  const routes = createMachineRoutes(engine);
  return { storage, engine, routes };
}
