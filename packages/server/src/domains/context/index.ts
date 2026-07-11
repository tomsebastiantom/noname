import { createContextRoutes } from "./api";
import { createContextEngine } from "./engine";
import { createPostgresContextAdapter } from "./adapters/postgres";
import type { ContextStorage } from "./ports";
import type { Database } from "../../drizzle";

export interface ContextDomainDeps {
  db: Database;
  storage?: ContextStorage;
}

export function createContextDomain(deps: ContextDomainDeps) {
  const storage = deps.storage ?? createPostgresContextAdapter(deps.db);
  const engine = createContextEngine(storage);
  const routes = createContextRoutes(engine);
  return { storage, engine, routes };
}
