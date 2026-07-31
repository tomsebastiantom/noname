import type { Hono } from "hono";
import { parseBody } from "../../../shared/parse-body";
import { created, notFound, ok } from "../../../shared/respond";
import { resolveRouteOrgId } from "../../../shared/site-id";
import { type AuthRouteDeps, requireAuthManage } from "./deps";
import { teamInviteSchema, teamRoleUpdateSchema } from "./schemas";

export function registerAuthTeamRoutes(routes: Hono, deps: AuthRouteDeps): void {
  const { service, tenantSettings } = deps;

  routes.get("/:orgId/auth/users", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const auth = await requireAuthManage(c);
    if (auth instanceof Response) return auth;

    return ok(c, await service.listTeamUsers(orgId));
  });

  routes.post("/:orgId/auth/users/invite", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const auth = await requireAuthManage(c);
    if (auth instanceof Response) return auth;

    const body = parseBody(teamInviteSchema.safeParse(await c.req.json()), "invite payload");
    return created(c, await service.inviteTeamUser(orgId, body));
  });

  routes.put("/:orgId/auth/users/:userId/role", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const auth = await requireAuthManage(c);
    if (auth instanceof Response) return auth;

    const body = parseBody(teamRoleUpdateSchema.safeParse(await c.req.json()), "role payload");
    const userId = c.req.param("userId");
    await service.updateTeamUserRole(orgId, userId, body.role);
    return ok(c, { ok: true });
  });
}
