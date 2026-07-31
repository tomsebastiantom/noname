import type {
  AssetDocumentService,
  ContentDocumentService,
  DocumentStorage,
  TenantSettingsService,
} from "../documents/contracts";
import { createAuthRoutes } from "./api";
import { createAuthProviderPublishHandler } from "./providers/publish";
import { createAuthService } from "./service";

export function createAuthDomain(deps: {
  tenantSettings: TenantSettingsService;
  assets: AssetDocumentService;
  content: Pick<ContentDocumentService, "findByType">;
  storage: DocumentStorage;
}) {
  const service = createAuthService(deps);
  const routes = createAuthRoutes(service, deps.tenantSettings);
  const onAuthProviderPublished = createAuthProviderPublishHandler({
    storage: deps.storage,
    tenantSettings: deps.tenantSettings,
  });
  return { service, routes, onAuthProviderPublished };
}

export { loginWithCredentials } from "./adapters/zitadel/client";
export { denyUnless } from "./deny-unless";
export { requireAuthenticatedUser, requirePermission } from "./guards";
export type { AuthService, LoginCredentials, LoginResult } from "./ports";
export { createAuthProviderPublishHandler } from "./providers/publish";
