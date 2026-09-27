import { PERMISSIONS } from "@noname/auth";
import { Hono } from "hono";
import { getOrgId, getUserId } from "../../../shared/org";
import { created, error, ok } from "../../../shared/respond";
import { denyUnless } from "../../auth/deny-unless";
import type { AudienceService, DomainActivity, ExperienceBindingInput } from "../ports";

export function createAudienceDefinitionRoutes(service: AudienceService): Hono {
  const routes = new Hono();
  const protect = async (c: Parameters<typeof denyUnless>[0]) =>
    denyUnless(c, PERMISSIONS.TENANT_MANAGE);
  const badRequest = (c: Parameters<typeof error>[0], e: unknown) =>
    error(c, e instanceof Error ? e.message : "Invalid request", 400);

  routes.get("/activity-types", async (c) => {
    const denied = await protect(c);
    if (denied) return denied;
    return ok(c, service.activityTypes.list());
  });
  routes.get("/definitions", async (c) => {
    const denied = await protect(c);
    if (denied) return denied;
    return ok(c, await service.listDefinitions(getOrgId(c)));
  });
  routes.post("/definitions", async (c) => {
    const denied = await protect(c);
    if (denied) return denied;
    try {
      const body = await c.req.json<{ key: string }>();
      return created(c, await service.createDefinition(getOrgId(c), body.key, getUserId(c)));
    } catch (e) {
      return badRequest(c, e);
    }
  });
  routes.get("/definitions/:key", async (c) => {
    const denied = await protect(c);
    if (denied) return denied;
    const value = await service.getDefinition(getOrgId(c), c.req.param("key"));
    return value ? ok(c, value) : error(c, "Audience definition not found", 404);
  });
  routes.post("/definitions/:key/versions", async (c) => {
    const denied = await protect(c);
    if (denied) return denied;
    try {
      const body = await c.req.json<Record<string, unknown>>();
      const input = {
        activityType: body.activityType as string,
        activityVersion: body.activityVersion as number,
        condition: body.condition as never,
        action: body.action as "assign" | "remove",
        expiry: body.expiry as never,
        createdBy: getUserId(c),
      };
      return created(c, await service.createVersion(getOrgId(c), c.req.param("key"), input));
    } catch (e) {
      return badRequest(c, e);
    }
  });
  routes.post("/definitions/:key/versions/:version/validate", async (c) => {
    const denied = await protect(c);
    if (denied) return denied;
    try {
      const body = await c.req
        .json<{ sample?: Omit<DomainActivity, "orgId"> }>()
        .catch((): { sample?: Omit<DomainActivity, "orgId"> } => ({}));
      const sample = body.sample
        ? ({ ...body.sample, orgId: getOrgId(c) } as DomainActivity)
        : undefined;
      return ok(
        c,
        await service.validateVersion(
          getOrgId(c),
          c.req.param("key"),
          Number(c.req.param("version")),
          sample,
        ),
      );
    } catch (e) {
      return badRequest(c, e);
    }
  });
  routes.post("/definitions/:key/versions/:version/activate", async (c) => {
    const denied = await protect(c);
    if (denied) return denied;
    try {
      return ok(
        c,
        await service.activateVersion(
          getOrgId(c),
          c.req.param("key"),
          Number(c.req.param("version")),
          getUserId(c),
        ),
      );
    } catch (e) {
      return badRequest(c, e);
    }
  });
  routes.post("/definitions/:key/disable", async (c) => {
    const denied = await protect(c);
    if (denied) return denied;
    const value = await service.setStatus(
      getOrgId(c),
      c.req.param("key"),
      "disabled",
      getUserId(c),
    );
    return value ? ok(c, value) : error(c, "Audience definition not found", 404);
  });
  routes.delete("/definitions/:key", async (c) => {
    const denied = await protect(c);
    if (denied) return denied;
    const value = await service.setStatus(
      getOrgId(c),
      c.req.param("key"),
      "archived",
      getUserId(c),
    );
    return value ? ok(c, value) : error(c, "Audience definition not found", 404);
  });
  routes.get("/definitions/:key/experience-bindings", async (c) => {
    const denied = await protect(c);
    if (denied) return denied;
    return ok(c, await service.listBindings(getOrgId(c), c.req.param("key")));
  });
  routes.post("/definitions/:key/experience-bindings", async (c) => {
    const denied = await protect(c);
    if (denied) return denied;
    try {
      const body = await c.req.json<ExperienceBindingInput>();
      const input: ExperienceBindingInput = {
        pageKey: body.pageKey,
        locale: body.locale,
        schemaId: body.schemaId,
        variantId: body.variantId,
        goalEvent: body.goalEvent,
        attributionWindowMs: body.attributionWindowMs,
      };
      return created(
        c,
        await service.createBinding(getOrgId(c), c.req.param("key"), getUserId(c), input),
      );
    } catch (e) {
      return badRequest(c, e);
    }
  });
  routes.post("/definitions/:key/experience-bindings/:version/activate", async (c) => {
    const denied = await protect(c);
    if (denied) return denied;
    try {
      return ok(
        c,
        await service.activateBinding(
          getOrgId(c),
          c.req.param("key"),
          Number(c.req.param("version")),
          getUserId(c),
        ),
      );
    } catch (e) {
      return badRequest(c, e);
    }
  });
  return routes;
}
