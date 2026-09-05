import { Hono } from "hono";
import type { TenantSettingsService } from "../documents/ports";
import type { AuthService } from "./ports";
import { registerAuthAccountRoutes } from "./routes/account";
import { registerAuthConfigRoutes } from "./routes/config";
import type { AuthRouteDeps } from "./routes/deps";
import { registerAuthLoginRoutes } from "./routes/login";
import { registerAuthMfaRoutes } from "./routes/mfa";
import { registerAuthOAuthRoutes } from "./routes/oauth";
import { registerAuthScopeRoutes } from "./routes/scope";
import { registerAuthSessionRoutes } from "./routes/session";
import { registerAuthTeamRoutes } from "./routes/team";
import type { ScopeService } from "./scope/service";

export function createAuthRoutes(
  service: AuthService,
  tenantSettings?: TenantSettingsService,
  scope?: ScopeService,
) {
  const routes = new Hono();
  const deps: AuthRouteDeps = { service, tenantSettings };

  registerAuthConfigRoutes(routes, deps);
  registerAuthOAuthRoutes(routes, deps);
  registerAuthLoginRoutes(routes, deps);
  registerAuthMfaRoutes(routes, deps);
  registerAuthAccountRoutes(routes, deps);
  registerAuthSessionRoutes(routes, deps);
  registerAuthTeamRoutes(routes, deps);
  if (scope) {
    registerAuthScopeRoutes(routes, { ...deps, scope });
  }

  return routes;
}
