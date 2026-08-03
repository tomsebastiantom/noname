import type { Hono } from "hono";
import { parseBody } from "../../../shared/parse-body";
import { created, notFound, ok } from "../../../shared/respond";
import { resolveRouteOrgId } from "../../../shared/site-id";
import { type AuthRouteDeps, requireScopeOrAuthManage } from "./deps";
import { assertCanAssignRole } from "./role-guards";
import { staffInviteSchema, teamRoleUpdateSchema } from "./schemas";

export function registerAuthTeamRoutes(routes: Hono, deps: AuthRouteDeps): void {
  const { service, tenantSettings } = deps;

  routes.get("/:orgId/users", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const auth = await requireScopeOrAuthManage(c);
    if (auth instanceof Response) return auth;

    return ok(c, await service.listTeamUsers(orgId));
  });

  routes.post("/:orgId/users/invite", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const auth = await requireScopeOrAuthManage(c);
    if (auth instanceof Response) return auth;

    const body = parseBody(staffInviteSchema.safeParse(await c.req.json()), "invite payload");
    await assertCanAssignRole(c, body.role);
    return created(c, await service.inviteTeamUser(orgId, body));
  });

  routes.put("/:orgId/users/:userId/role", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const auth = await requireScopeOrAuthManage(c);
    if (auth instanceof Response) return auth;

    const body = parseBody(teamRoleUpdateSchema.safeParse(await c.req.json()), "role payload");
    await assertCanAssignRole(c, body.role);
    const userId = c.req.param("userId");
    await service.updateTeamUserRole(orgId, userId, body.role);
    return ok(c, { ok: true });
  });
}
