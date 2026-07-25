import type { TenantSettingsService } from "../documents/ports";
import { createAuthRoutes } from "./api";
import { createAuthService } from "./service";

export function createAuthDomain(deps: { tenantSettings: TenantSettingsService }) {
  const service = createAuthService(deps);
  const routes = createAuthRoutes(service, deps.tenantSettings);
  return { service, routes };
}

export type { AuthService, LoginCredentials, LoginResult } from "./ports";
export { loginWithCredentials } from "./zitadel-client";
