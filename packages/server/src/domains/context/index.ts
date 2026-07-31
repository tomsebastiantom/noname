import type { Database } from "../../drizzle";
import { createPostgresContextAdapter } from "./adapters/postgres";
import { createContextRoutes } from "./api";
import type { ContextStorage } from "./ports";
import { createContextService } from "./service";

export interface ContextDomainDeps {
  db: Database;
  storage?: ContextStorage;
}

export function createContextDomain(deps: ContextDomainDeps) {
  const storage = deps.storage ?? createPostgresContextAdapter(deps.db);
  const service = createContextService(storage);
  const routes = createContextRoutes(service);
  return { storage, service, routes };
}
