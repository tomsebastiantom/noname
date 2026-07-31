import type { Hono } from "hono";
import { parseBody } from "../../../shared/parse-body";
import { created, notFound, ok } from "../../../shared/respond";
import { resolveRouteOrgId } from "../../../shared/site-id";
import type { AuthRouteDeps } from "./deps";
import {
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  registerBodySchema,
} from "./schemas";

export function registerAuthAccountRoutes(routes: Hono, deps: AuthRouteDeps): void {
  const { service, tenantSettings } = deps;

  routes.post("/:orgId/password-reset/request", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const body = parseBody(
      passwordResetRequestSchema.safeParse(await c.req.json()),
      "password reset payload",
    );

    await service.requestPasswordReset({ orgId, email: body.email });
    return ok(c, { ok: true });
  });

  routes.post("/:orgId/password-reset/confirm", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const body = parseBody(
      passwordResetConfirmSchema.safeParse(await c.req.json()),
      "password reset confirmation payload",
    );

    await service.confirmPasswordReset({
      orgId,
      userId: body.userId,
      verificationCode: body.verificationCode,
      newPassword: body.newPassword,
    });
    return ok(c, { ok: true });
  });

  routes.post("/:orgId/register", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const body = parseBody(
      registerBodySchema.safeParse(await c.req.json()),
      "registration payload",
    );

    return created(
      c,
      await service.register({
        orgId,
        email: body.email,
        password: body.password,
        givenName: body.givenName,
        familyName: body.familyName,
      }),
    );
  });
}
