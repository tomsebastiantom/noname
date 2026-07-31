import { primaryTeamRole, resolveAuthContextFromAccessToken } from "@noname/auth";
import type { Hono } from "hono";
import { notFound, ok } from "../../../shared/respond";
import { resolveRouteOrgId } from "../../../shared/site-id";
import { zitadelIssuer } from "../adapters/zitadel/issuer";
import { zitadelProjectIdOrNull } from "../adapters/zitadel/project-id";
import { requireAuthenticatedUser } from "../guards";
import type { AuthRouteDeps } from "./deps";

export function registerAuthSessionRoutes(routes: Hono, deps: AuthRouteDeps): void {
  const { service, tenantSettings } = deps;

  routes.get("/:orgId/session", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const auth = requireAuthenticatedUser(c);
    if (auth instanceof Response) return auth;

    const status = await service.getSessionStatus(orgId, auth.userId);
    const projectId = zitadelProjectIdOrNull() ?? undefined;
    const { roles, permissions } = await resolveAuthContextFromAccessToken(auth.userToken, {
      projectId,
      issuer: zitadelIssuer(),
    });
    const teamRole = primaryTeamRole(roles);
    return ok(c, {
      ...status,
      roles,
      permissions,
      teamRole,
    });
  });
}
