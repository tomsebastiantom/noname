import type {
  AssetDocumentService,
  ContentDocumentService,
  DocumentStorage,
  TenantSettingsService,
} from "../documents/contracts";
import type { NotificationsService } from "../notifications/ports";
import { teamRoleAssignments } from "./adapters/zitadel/authorizations";
import { zitadelProjectId } from "./adapters/zitadel/project-id";
import { createAuthRoutes } from "./api";
import { createAuthorization } from "./create-authorization";
import { createAuthProviderPublishHandler } from "./providers/publish";
import { createScopeService } from "./scope/service";
import { createAuthService } from "./service";

export function createAuthDomain(deps: {
  db: import("../../drizzle").Database;
  tenantSettings: TenantSettingsService;
  assets: AssetDocumentService;
  content: Pick<ContentDocumentService, "findByType">;
  storage: DocumentStorage;
  notifications?: Pick<NotificationsService, "notify">;
}) {
  const service = createAuthService(deps);
  const authorization = createAuthorization();
  const scope = createScopeService({
    db: deps.db,
    storage: deps.storage,
    tupleWriter: authorization,
    tupleReader: authorization,
    resolveUserStaffRole: async (orgId, userId) => {
      const roleMap = await teamRoleAssignments(orgId, zitadelProjectId());
      return roleMap.get(userId) ?? null;
    },
  });
  const routes = createAuthRoutes(service, deps.tenantSettings, scope);
  const onAuthProviderPublished = createAuthProviderPublishHandler({
    storage: deps.storage,
    tenantSettings: deps.tenantSettings,
  });
  return { service, routes, scope, onAuthProviderPublished };
}

export { loginWithCredentials } from "./adapters/zitadel/client";
export type {
  AuthNamespace,
  AuthorizationPort,
  AuthSubject,
  RelationTuple,
  ResourcePermission,
} from "./authorization-port";
export { createAuthorization, createTupleWriter } from "./create-authorization";
export { denyUnless } from "./deny-unless";
export {
  denyUnlessCollectionAccess,
  denyUnlessDocumentAccess,
} from "./deny-unless-document-access";
export {
  authSubjectFromActor,
  requireActorPermission,
  requireAuthenticatedActor,
  requireAuthenticatedUser,
  requireHumanPermission,
  requirePermission,
} from "./guards";
export type { AuthService, LoginCredentials, LoginResult } from "./ports";
export { createAuthProviderPublishHandler } from "./providers/publish";
