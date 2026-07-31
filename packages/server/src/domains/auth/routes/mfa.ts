import type { Hono } from "hono";
import { parseBody } from "../../../shared/parse-body";
import { notFound, ok } from "../../../shared/respond";
import { resolveRouteOrgId } from "../../../shared/site-id";
import { requireAuthenticatedUser } from "../guards";
import type { AuthRouteDeps } from "./deps";
import { mfaEnrollmentConfirmSchema } from "./schemas";

export function registerAuthMfaRoutes(routes: Hono, deps: AuthRouteDeps): void {
  const { service, tenantSettings } = deps;

  routes.post("/:orgId/mfa/totp/register", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const auth = requireAuthenticatedUser(c);
    if (auth instanceof Response) return auth;

    return ok(
      c,
      await service.startTotpEnrollment({
        userId: auth.userId,
        userToken: auth.userToken,
      }),
    );
  });

  routes.post("/:orgId/mfa/totp/confirm", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const auth = requireAuthenticatedUser(c);
    if (auth instanceof Response) return auth;

    const body = parseBody(
      mfaEnrollmentConfirmSchema.safeParse(await c.req.json()),
      "TOTP confirmation payload",
    );

    await service.confirmTotpEnrollment({
      orgId,
      userId: auth.userId,
      userToken: auth.userToken,
      code: body.code,
    });
    return ok(c, { ok: true });
  });
}
