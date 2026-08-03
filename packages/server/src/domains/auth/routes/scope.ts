import type { Hono } from "hono";
import { parseBody } from "../../../shared/parse-body";
import { created, notFound, ok } from "../../../shared/respond";
import { resolveRouteOrgId } from "../../../shared/site-id";
import type { ScopeService } from "../scope/service";
import { type AuthRouteDeps, requireScopeOrAuthManage } from "./deps";
import { scopeCatalogSchema } from "./schemas";

export function registerAuthScopeRoutes(
  routes: Hono,
  deps: AuthRouteDeps & { scope: ScopeService },
): void {
  const { tenantSettings, scope } = deps;

  routes.get("/:orgId/scope/collections", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const auth = await requireScopeOrAuthManage(c);
    if (auth instanceof Response) return auth;
    return ok(c, await scope.listCollections(orgId));
  });

  routes.post("/:orgId/scope/collections", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const auth = await requireScopeOrAuthManage(c);
    if (auth instanceof Response) return auth;
    const body = parseBody(scopeCatalogSchema.safeParse(await c.req.json()), "collection payload");
    await scope.createCollection(orgId, body.slug, body.label ?? body.slug, body.parentId);
    return created(c, { ok: true });
  });

  routes.delete("/:orgId/scope/collections/:slug", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const auth = await requireScopeOrAuthManage(c);
    if (auth instanceof Response) return auth;
    await scope.deleteCollection(orgId, c.req.param("slug"));
    return ok(c, { ok: true });
  });

  routes.get("/:orgId/scope/teams", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const auth = await requireScopeOrAuthManage(c);
    if (auth instanceof Response) return auth;
    return ok(c, await scope.listTeams(orgId));
  });

  routes.post("/:orgId/scope/teams", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const auth = await requireScopeOrAuthManage(c);
    if (auth instanceof Response) return auth;
    const body = parseBody(scopeCatalogSchema.safeParse(await c.req.json()), "team payload");
    await scope.createTeam(orgId, body.slug, body.label ?? body.slug);
    return created(c, { ok: true });
  });

  routes.delete("/:orgId/scope/teams/:slug", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const auth = await requireScopeOrAuthManage(c);
    if (auth instanceof Response) return auth;
    await scope.deleteTeam(orgId, c.req.param("slug"));
    return ok(c, { ok: true });
  });

  routes.get("/:orgId/scope/bindings", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const auth = await requireScopeOrAuthManage(c);
    if (auth instanceof Response) return auth;
    return ok(c, await scope.listCollectionTeamBindings(orgId));
  });

  routes.put("/:orgId/scope/collection/:collection/teams/:team/editors", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const auth = await requireScopeOrAuthManage(c);
    if (auth instanceof Response) return auth;
    await scope.bindCollectionTeamEditors(orgId, c.req.param("collection"), c.req.param("team"));
    return ok(c, { ok: true });
  });

  routes.put("/:orgId/scope/collection/:collection/teams/:team/publishers", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const auth = await requireScopeOrAuthManage(c);
    if (auth instanceof Response) return auth;
    await scope.bindCollectionTeamPublishers(orgId, c.req.param("collection"), c.req.param("team"));
    return ok(c, { ok: true });
  });

  routes.delete("/:orgId/scope/collection/:collection/teams/:team/editors", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const auth = await requireScopeOrAuthManage(c);
    if (auth instanceof Response) return auth;
    await scope.unbindCollectionTeamEditors(orgId, c.req.param("collection"), c.req.param("team"));
    return ok(c, { ok: true });
  });

  routes.delete("/:orgId/scope/collection/:collection/teams/:team/publishers", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const auth = await requireScopeOrAuthManage(c);
    if (auth instanceof Response) return auth;
    await scope.unbindCollectionTeamPublishers(
      orgId,
      c.req.param("collection"),
      c.req.param("team"),
    );
    return ok(c, { ok: true });
  });

  routes.get("/:orgId/scope/team/:team/members", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const auth = await requireScopeOrAuthManage(c);
    if (auth instanceof Response) return auth;
    return ok(c, await scope.listTeamMembers(orgId, c.req.param("team")));
  });

  routes.put("/:orgId/scope/team/:team/editors/:userId", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const auth = await requireScopeOrAuthManage(c);
    if (auth instanceof Response) return auth;
    await scope.grantTeamEditor(orgId, c.req.param("team"), c.req.param("userId"));
    return ok(c, { ok: true });
  });

  routes.delete("/:orgId/scope/team/:team/editors/:userId", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const auth = await requireScopeOrAuthManage(c);
    if (auth instanceof Response) return auth;
    await scope.revokeTeamEditor(orgId, c.req.param("team"), c.req.param("userId"));
    return ok(c, { ok: true });
  });

  routes.put("/:orgId/scope/team/:team/publishers/:userId", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const auth = await requireScopeOrAuthManage(c);
    if (auth instanceof Response) return auth;
    await scope.grantTeamPublisher(orgId, c.req.param("team"), c.req.param("userId"));
    return ok(c, { ok: true });
  });

  routes.delete("/:orgId/scope/team/:team/publishers/:userId", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const auth = await requireScopeOrAuthManage(c);
    if (auth instanceof Response) return auth;
    await scope.revokeTeamPublisher(orgId, c.req.param("team"), c.req.param("userId"));
    return ok(c, { ok: true });
  });

  routes.get("/:orgId/scope/document/:documentId/editors", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const auth = await requireScopeOrAuthManage(c);
    if (auth instanceof Response) return auth;
    const editors = await scope.listDocumentEditors(orgId, c.req.param("documentId"));
    return ok(c, editors);
  });

  routes.put("/:orgId/scope/document/:documentId/editors/:userId", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const auth = await requireScopeOrAuthManage(c);
    if (auth instanceof Response) return auth;
    await scope.grantDocumentEditor(orgId, c.req.param("documentId"), c.req.param("userId"));
    return ok(c, { ok: true });
  });

  routes.delete("/:orgId/scope/document/:documentId/editors/:userId", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const auth = await requireScopeOrAuthManage(c);
    if (auth instanceof Response) return auth;
    await scope.revokeDocumentEditor(orgId, c.req.param("documentId"), c.req.param("userId"));
    return ok(c, { ok: true });
  });

  routes.get("/:orgId/scope/document/:documentId/publishers", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const auth = await requireScopeOrAuthManage(c);
    if (auth instanceof Response) return auth;
    const publishers = await scope.listDocumentPublishers(orgId, c.req.param("documentId"));
    return ok(c, publishers);
  });

  routes.put("/:orgId/scope/document/:documentId/publishers/:userId", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const auth = await requireScopeOrAuthManage(c);
    if (auth instanceof Response) return auth;
    await scope.grantDocumentPublisher(orgId, c.req.param("documentId"), c.req.param("userId"));
    return ok(c, { ok: true });
  });

  routes.delete("/:orgId/scope/document/:documentId/publishers/:userId", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const auth = await requireScopeOrAuthManage(c);
    if (auth instanceof Response) return auth;
    await scope.revokeDocumentPublisher(orgId, c.req.param("documentId"), c.req.param("userId"));
    return ok(c, { ok: true });
  });
}
