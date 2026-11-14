import type { Hono } from "hono";
import { parseBody } from "../../../shared/parse-body";
import { notFound, ok } from "../../../shared/respond";
import { resolveRouteOrgId } from "../../../shared/site-id";
import type { AuthRouteDeps } from "./deps";
import { loginBodySchema, mfaVerifyBodySchema } from "./schemas";

/**
 * Only tokens that can act across tenants are worth an audit row. A tenant user's own session is not a control-plane
 * credential, and recording every login would drown the privileged ones.
 */
async function recordPlatformToken(
  deps: AuthRouteDeps,
  orgId: string,
  result: { accessToken: string; expiresIn?: number },
): Promise<void> {
  if (!deps.audit) return;
  const platformOrg = process.env.PLATFORM_ORG_ID?.trim();
  if (!platformOrg || orgId !== platformOrg) return;

  const { createHash } = await import("node:crypto");
  await deps.audit({
    orgId,
    action: "platform.token.issued",
    actorId: "auth",
    subjectId: "platform-token",
    metadata: {
      // A hash makes the row correlatable without ever storing the credential.
      tokenHash: createHash("sha256").update(result.accessToken).digest("hex").slice(0, 32),
      expiresIn: result.expiresIn ?? null,
    },
  });
}

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

    if (result.accessToken) await recordPlatformToken(deps, orgId, { accessToken: result.accessToken, expiresIn: result.expiresIn });

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
