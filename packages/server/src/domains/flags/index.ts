import type { Database } from "../../drizzle";
import { eventBus } from "../../shared/event-bus";
import { broadcast } from "../../shared/sse-manager";
import { createPostgresFlagStorage } from "./adapters/postgres";
import { createFlagRoutes } from "./api";
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

  // SSE: broadcast flag changes to connected clients
  eventBus.subscribe("flag.created", async (data: any) => {
    if (data?.orgId && data?.key) {
      broadcast(data.orgId, { key: data.key });
    }
  });
  eventBus.subscribe("flag.updated", async (data: any) => {
    if (data?.orgId && data?.key) {
      broadcast(data.orgId, { key: data.key });
    }
  });
  eventBus.subscribe("flag.archived", async (data: any) => {
    if (data?.orgId && data?.key) {
      broadcast(data.orgId, { key: data.key });
    }
  });

  return { storage, service, routes };
}
