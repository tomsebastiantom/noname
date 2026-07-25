import { createAuthRoutes } from "./api";
import { createAuthService } from "./service";

export function createAuthDomain() {
  const service = createAuthService();
  const routes = createAuthRoutes(service);
  return { service, routes };
}

export type { AuthService, LoginCredentials, LoginResult } from "./ports";
export { loginWithCredentials } from "./zitadel-client";
