import { resolveAuthContextFromAccessToken } from "@noname/auth";
import type { Database } from "../../drizzle";
import { zitadelIssuer } from "../auth/adapters/zitadel/issuer";
import { zitadelProjectIdOrNull } from "../auth/adapters/zitadel/project-id";
import type { AuthorizationPort } from "../auth/authorization-port";
import type { LayoutCollabRoomManager } from "../collab/layout-room";
import type { LayoutDocumentService } from "../documents/ports";
import { createPostgresAgentTaskStorage } from "./adapters/postgres";
import { createAgentRegistryStorage } from "./adapters/registry-postgres";
import { createAgentRoutes } from "./api";
import { createAgentRegistryService } from "./registry-service";
import { createAgentService } from "./service";
import type { AgentExecutor } from "./tools";
import type { AgentWorkerHooks } from "./worker";
import { startAgentWorker } from "./worker";

export interface AgentDomainDeps {
  db: Database;
  executor: AgentExecutor;
  authorization: AuthorizationPort;
  agentTokenSecret?: string;
  workerHooks?: AgentWorkerHooks;
  layout?: Pick<LayoutDocumentService, "update" | "get">;
  layoutCollabRooms?: Pick<
    LayoutCollabRoomManager,
    "applySpec" | "flushPersist" | "syncFromDatabase"
  >;
}

export function createAgentDomain(deps: AgentDomainDeps) {
  const registryStorage = createAgentRegistryStorage(deps.db);
  const taskStorage = createPostgresAgentTaskStorage(deps.db);
  const taskService = createAgentService(taskStorage);
  const tokenSecret = deps.agentTokenSecret ?? process.env.AGENT_TOKEN_SECRET ?? "";
  const registry = createAgentRegistryService({
    storage: registryStorage,
    authorization: deps.authorization,
    tokenSecret,
    resolveCreatorPermissions: async (_userId, userToken) => {
      const { permissions } = await resolveAuthContextFromAccessToken(userToken, {
        projectId: zitadelProjectIdOrNull() ?? undefined,
        issuer: zitadelIssuer(),
      });
      return permissions;
    },
  });
  const routes = createAgentRoutes({
    service: taskService,
    registry,
    registryStorage: registryStorage,
    layoutPatchRevert:
      deps.layout && deps.layoutCollabRooms
        ? { layout: deps.layout, layoutCollabRooms: deps.layoutCollabRooms }
        : undefined,
  });
  const worker = startAgentWorker(taskStorage, deps.executor, {
    registryStorage,
    ...deps.workerHooks,
  });

  return {
    storage: registryStorage,
    taskStorage,
    taskService,
    registry,
    routes,
    worker,
  };
}
