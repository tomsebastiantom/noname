import type { Hono } from "hono";
import { parseBody } from "../../../shared/parse-body";
import { notFound, ok } from "../../../shared/respond";
import { resolveRouteOrgId } from "../../../shared/site-id";
import { type AuthRouteDeps, requireAuthManage } from "./deps";
import { authConfigUpdateSchema } from "./schemas";

export function registerAuthConfigRoutes(routes: Hono, deps: AuthRouteDeps): void {
  const { service, tenantSettings } = deps;

  routes.get("/:orgId/auth/config", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    return ok(c, await service.getConfig(orgId));
  });

  routes.put("/:orgId/auth/config", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const auth = await requireAuthManage(c);
    if (auth instanceof Response) return auth;

    const body = parseBody(
      authConfigUpdateSchema.safeParse(await c.req.json()),
      "auth config payload",
    );
    return ok(c, await service.updateConfig(orgId, body));
  });
}
