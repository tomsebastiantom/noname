import type { Hono } from "hono";
import { parseBody } from "../../../shared/parse-body";
import { notFound, ok } from "../../../shared/respond";
import { resolveRouteOrgId } from "../../../shared/site-id";
import type { AuthRouteDeps } from "./deps";
import { loginBodySchema, mfaVerifyBodySchema } from "./schemas";

export function registerAuthLoginRoutes(routes: Hono, deps: AuthRouteDeps): void {
  const { service, tenantSettings } = deps;

  routes.post("/:orgId/login", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const body = parseBody(loginBodySchema.safeParse(await c.req.json()), "login payload");

    const result = await service.login({
      orgId,
      email: body.email,
      password: body.password,
      clientId: body.clientId,
      redirectUri: body.redirectUri,
      codeVerifier: body.codeVerifier,
    });

    if (result.mfaRequired) {
      return ok(c, {
        mfaRequired: true,
        sessionId: result.sessionId,
        sessionToken: result.sessionToken,
        authRequestId: result.authRequestId,
      });
    }

    return ok(c, {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      email: result.email,
      displayName: result.displayName,
    });
  });

  routes.post("/:orgId/mfa/verify", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const body = parseBody(mfaVerifyBodySchema.safeParse(await c.req.json()), "MFA payload");

    const result = await service.verifyMfa({ orgId, ...body });
    return ok(c, {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      email: result.email,
      displayName: result.displayName,
    });
  });
}
