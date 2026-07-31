import type { Database } from "../../drizzle";
import { createPostgresFlagStorage } from "./adapters/postgres";
import { createFlagRoutes } from "./api";
import { registerFlagListeners } from "./listeners";
import type { FlagStorage } from "./ports";
import { createFlagService } from "./service";

export interface FlagDomainDeps {
  db: Database;
  storage?: FlagStorage;
}

export function createFlagDomain(deps: FlagDomainDeps) {
  const storage = deps.storage ?? createPostgresFlagStorage(deps.db);
  const service = createFlagService(storage);
  const routes = createFlagRoutes(service);

  registerFlagListeners();

  return { storage, service, routes };
}
