import { PERMISSIONS, primaryTeamRole, resolveAuthContextFromAccessToken } from "@noname/auth";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { ValidationError } from "../../shared/domain-error";
import { parseBody } from "../../shared/parse-body";
import { created, notFound, ok } from "../../shared/respond";
import { resolveRouteOrgId } from "../../shared/site-id";
import { isSupportedLoginProvider, type TenantSettingsService } from "../documents/contracts";
import { zitadelIssuer } from "./adapters/zitadel/issuer";
import { zitadelProjectIdOrNull } from "./adapters/zitadel/project-id";
import { requireAuthenticatedUser, requirePermission } from "./guards";
import type { AuthService } from "./ports";

const loginBodySchema = z.object({
  email: z.email(),
  password: z.string().min(1),
  codeVerifier: z.string().min(43).max(128),
  clientId: z.string().min(1),
  redirectUri: z.url(),
});

const oauthStartQuerySchema = z.object({
  clientId: z.string().min(1),
  redirectUri: z.url(),
  codeChallenge: z.string().min(43).max(128),
});

const oauthCallbackBodySchema = z.object({
  code: z.string().min(1),
  codeVerifier: z.string().min(43).max(128),
  clientId: z.string().min(1),
  redirectUri: z.url(),
});

const authConfigUpdateSchema = z.object({
  providers: z.array(z.enum(["google", "github", "apple"])).optional(),
  idpIds: z.record(z.string(), z.string()).optional(),
  allowPassword: z.boolean().optional(),
  allowSignUp: z.boolean().optional(),
  allowPasswordReset: z.boolean().optional(),
  requireMfaForAdmin: z.boolean().optional(),
  googleOAuth: z
    .object({
      clientId: z.string().min(1),
      clientSecret: z.string().min(1),
    })
    .optional(),
  githubOAuth: z
    .object({
      clientId: z.string().min(1),
      clientSecret: z.string().min(1),
    })
    .optional(),
  appleOAuth: z
    .object({
      clientId: z.string().min(1),
      teamId: z.string().min(1),
      keyId: z.string().min(1),
      privateKey: z.string().min(1),
    })
    .optional(),
});

const passwordResetRequestSchema = z.object({
  email: z.email(),
});

const passwordResetConfirmSchema = z.object({
  userId: z.string().min(1),
  verificationCode: z.string().min(1),
  newPassword: z.string().min(8),
});

const registerBodySchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  givenName: z.string().min(1).optional(),
  familyName: z.string().min(1).optional(),
});

const mfaVerifyBodySchema = z.object({
  sessionId: z.string().min(1),
  sessionToken: z.string().min(1),
  authRequestId: z.string().min(1),
  totpCode: z.string().min(1),
  codeVerifier: z.string().min(43).max(128),
  clientId: z.string().min(1),
  redirectUri: z.url(),
});

const mfaEnrollmentConfirmSchema = z.object({
  code: z.string().min(1),
});

const teamInviteSchema = z.object({
  email: z.email(),
  givenName: z.string().min(1).optional(),
  familyName: z.string().min(1).optional(),
  role: z.enum(["admin", "editor"]).default("editor"),
});

const teamRoleUpdateSchema = z.object({
  role: z.enum(["admin", "editor"]),
});

async function requireAuthManage(
  c: Context,
): Promise<Awaited<ReturnType<typeof requirePermission>>> {
  return requirePermission(c, PERMISSIONS.AUTH_MANAGE);
}

export function createAuthRoutes(service: AuthService, tenantSettings?: TenantSettingsService) {
  const routes = new Hono();

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

  routes.get("/:orgId/auth/idp/:provider/start", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const provider = c.req.param("provider");
    if (!isSupportedLoginProvider(provider)) {
      throw new ValidationError("provider", "Unsupported identity provider");
    }

    const query = parseBody(
      oauthStartQuerySchema.safeParse({
        clientId: c.req.query("clientId"),
        redirectUri: c.req.query("redirectUri"),
        codeChallenge: c.req.query("codeChallenge"),
      }),
      "OAuth start parameters",
    );

    return ok(
      c,
      await service.startIdpLogin({
        orgId,
        provider,
        clientId: query.clientId,
        redirectUri: query.redirectUri,
        codeChallenge: query.codeChallenge,
      }),
    );
  });

  routes.post("/:orgId/auth/callback", async (c) => {
    const body = parseBody(
      oauthCallbackBodySchema.safeParse(await c.req.json()),
      "OAuth callback payload",
    );
    const result = await service.exchangeOAuthCallback(body);
    return ok(c, {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
    });
  });

  routes.post("/:orgId/auth/login", async (c) => {
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
    });
  });

  routes.post("/:orgId/auth/mfa/verify", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const body = parseBody(mfaVerifyBodySchema.safeParse(await c.req.json()), "MFA payload");

    const result = await service.verifyMfa({ orgId, ...body });
    return ok(c, {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
    });
  });

  routes.post("/:orgId/auth/mfa/totp/register", async (c) => {
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

  routes.post("/:orgId/auth/mfa/totp/confirm", async (c) => {
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

  routes.post("/:orgId/auth/password-reset/request", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const body = parseBody(
      passwordResetRequestSchema.safeParse(await c.req.json()),
      "password reset payload",
    );

    await service.requestPasswordReset({ orgId, email: body.email });
    return ok(c, { ok: true });
  });

  routes.post("/:orgId/auth/password-reset/confirm", async (c) => {
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

  routes.post("/:orgId/auth/register", async (c) => {
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

  routes.get("/:orgId/auth/session", async (c) => {
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

  return routes;
}
