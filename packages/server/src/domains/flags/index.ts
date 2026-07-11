import { createFlagRoutes } from "./api";
import { createFlagService } from "./service";
import { createPostgresFlagStorage } from "./adapters/postgres";
import type { FlagStorage } from "./ports";
import type { Database } from "../../drizzle";

export interface FlagDomainDeps {
  db: Database;
  storage?: FlagStorage;
}

export function createFlagDomain(deps: FlagDomainDeps) {
  const storage = deps.storage ?? createPostgresFlagStorage(deps.db);
  const service = createFlagService(storage);
  const routes = createFlagRoutes(service);
  return { storage, service, routes };
}
