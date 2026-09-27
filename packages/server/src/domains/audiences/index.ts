import type { Database } from "../../drizzle";
import { createActivityTypeRegistry } from "./activity-registry";
import { createPostgresAudienceStorage } from "./adapters/postgres";
import type { ActivityTypeRegistry, AudienceStorage } from "./ports";
import { createAudienceDefinitionRoutes } from "./routes/definitions";
import { createAudienceService } from "./service";

export interface AudienceDomainDeps {
  db: Database;
  storage?: AudienceStorage;
  activityTypes?: ActivityTypeRegistry;
}

export function createAudienceDomain(deps: AudienceDomainDeps) {
  const storage = deps.storage ?? createPostgresAudienceStorage(deps.db);
  const activityTypes = deps.activityTypes ?? createActivityTypeRegistry();
  const service = createAudienceService(storage, activityTypes);
  const routes = createAudienceDefinitionRoutes(service);
  return { storage, service, routes, activityTypes };
}
