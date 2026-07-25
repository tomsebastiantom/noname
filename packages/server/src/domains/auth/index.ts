import { createAuthRoutes } from "./api";
import { createAuthService } from "./service";
import type { TenantSettingsService } from "../documents/ports";

export function createAuthDomain(deps: { tenantSettings: TenantSettingsService }) {
  const service = createAuthService(deps);
  const routes = createAuthRoutes(service);
  return { service, routes };
}

export type { AuthService, LoginCredentials, LoginResult } from "./ports";
export { loginWithCredentials } from "./zitadel-client";
