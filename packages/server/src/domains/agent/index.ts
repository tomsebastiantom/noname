import type { Database } from "../../drizzle";
import { createPostgresAgentTaskStorage } from "./adapters/postgres";
import { createAgentRoutes } from "./api";
import { createAgentService } from "./service";
import type { AgentExecutor } from "./tools";
import { startAgentWorker } from "./worker";

export interface AgentDomainDeps {
  db: Database;
  executor: AgentExecutor;
}

export function createAgentDomain(deps: AgentDomainDeps) {
  const storage = createPostgresAgentTaskStorage(deps.db);
  const service = createAgentService(storage);
  const routes = createAgentRoutes(service);
  const worker = startAgentWorker(storage, deps.executor);

  return { storage, service, routes, worker };
}
