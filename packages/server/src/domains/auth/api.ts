import { PERMISSIONS, resolveAuthContextFromAccessToken } from "@noname/auth";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { notFound } from "../../shared/respond";
import { resolveSiteIdToOrgId } from "../../shared/site-id";
import type { TenantSettingsService } from "../documents/ports";
import { zitadelProjectIdOrNull } from "./adapters/zitadel/project-id";
import { requireAuthenticatedUser, requirePermission } from "./guards";
import type { AuthService } from "./ports";

const ZITADEL_ISSUER = process.env.ZITADEL_ISSUER ?? "http://localhost:8080";

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

import { isSupportedLoginProvider } from "../documents/content-types/auth-provider";

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

  async function orgFromParam(siteId: string): Promise<string | null> {
    if (!tenantSettings) return siteId;
    return resolveSiteIdToOrgId(tenantSettings, siteId);
  }

  routes.get("/:orgId/auth/config", async (c) => {
    const orgId = await orgFromParam(c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const config = await service.getConfig(orgId);
    return c.json({ data: config });
  });

  routes.put("/:orgId/auth/config", async (c) => {
    const orgId = await orgFromParam(c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const auth = await requireAuthManage(c);
    if (auth instanceof Response) return auth;

    const parsed = authConfigUpdateSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "Invalid auth config payload" }, 400);
    }
    try {
      const config = await service.updateConfig(orgId, parsed.data);
      return c.json({ data: config });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Auth config update failed";
      return c.json({ error: message }, 400);
    }
  });

  routes.get("/:orgId/auth/idp/:provider/start", async (c) => {
    const orgId = await orgFromParam(c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const provider = c.req.param("provider");
    if (!isSupportedLoginProvider(provider)) {
      return c.json({ error: "Unsupported identity provider" }, 400);
    }

    const parsed = oauthStartQuerySchema.safeParse({
      clientId: c.req.query("clientId"),
      redirectUri: c.req.query("redirectUri"),
      codeChallenge: c.req.query("codeChallenge"),
    });
    if (!parsed.success) {
      return c.json({ error: "Invalid OAuth start parameters" }, 400);
    }

    try {
      const result = await service.startIdpLogin({
        orgId,
        provider,
        clientId: parsed.data.clientId,
        redirectUri: parsed.data.redirectUri,
        codeChallenge: parsed.data.codeChallenge,
      });
      return c.json({ data: result });
    } catch (err) {
      const message = err instanceof Error ? err.message : "OAuth start failed";
      return c.json({ error: message }, 503);
    }
  });

  routes.post("/:orgId/auth/callback", async (c) => {
    const parsed = oauthCallbackBodySchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "Invalid OAuth callback payload" }, 400);
    }

    try {
      const result = await service.exchangeOAuthCallback(parsed.data);
      return c.json({
        data: {
          accessToken: result.accessToken,
          expiresIn: result.expiresIn,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "OAuth callback failed";
      return c.json({ error: message }, 401);
    }
  });

  routes.post("/:orgId/auth/login", async (c) => {
    const orgId = await orgFromParam(c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const parsed = loginBodySchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "Invalid login payload" }, 400);
    }

    try {
      const result = await service.login({
        orgId,
        email: parsed.data.email,
        password: parsed.data.password,
        clientId: parsed.data.clientId,
        redirectUri: parsed.data.redirectUri,
        codeVerifier: parsed.data.codeVerifier,
      });
      if (result.mfaRequired) {
        return c.json({
          data: {
            mfaRequired: true,
            sessionId: result.sessionId,
            sessionToken: result.sessionToken,
            authRequestId: result.authRequestId,
          },
        });
      }
      return c.json({
        data: {
          accessToken: result.accessToken,
          expiresIn: result.expiresIn,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      return c.json({ error: message }, 401);
    }
  });

  routes.post("/:orgId/auth/mfa/verify", async (c) => {
    const orgId = await orgFromParam(c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const parsed = mfaVerifyBodySchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "Invalid MFA payload" }, 400);
    }

    try {
      const result = await service.verifyMfa({
        orgId,
        ...parsed.data,
      });
      return c.json({
        data: {
          accessToken: result.accessToken,
          expiresIn: result.expiresIn,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "MFA verification failed";
      return c.json({ error: message }, 401);
    }
  });

  routes.post("/:orgId/auth/mfa/totp/register", async (c) => {
    const orgId = await orgFromParam(c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const auth = requireAuthenticatedUser(c);
    if (auth instanceof Response) return auth;

    try {
      const result = await service.startTotpEnrollment({
        userId: auth.userId,
        userToken: auth.userToken,
      });
      return c.json({ data: result });
    } catch (err) {
      const message = err instanceof Error ? err.message : "TOTP enrollment failed";
      return c.json({ error: message }, 400);
    }
  });

  routes.post("/:orgId/auth/mfa/totp/confirm", async (c) => {
    const orgId = await orgFromParam(c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const auth = requireAuthenticatedUser(c);
    if (auth instanceof Response) return auth;

    const parsed = mfaEnrollmentConfirmSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "Invalid TOTP confirmation payload" }, 400);
    }

    try {
      await service.confirmTotpEnrollment({
        orgId,
        userId: auth.userId,
        userToken: auth.userToken,
        code: parsed.data.code,
      });
      return c.json({ data: { ok: true } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "TOTP confirmation failed";
      return c.json({ error: message }, 400);
    }
  });

  routes.post("/:orgId/auth/password-reset/request", async (c) => {
    const orgId = await orgFromParam(c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const parsed = passwordResetRequestSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "Invalid password reset payload" }, 400);
    }

    try {
      await service.requestPasswordReset({ orgId, email: parsed.data.email });
      return c.json({ data: { ok: true } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Password reset request failed";
      return c.json({ error: message }, 400);
    }
  });

  routes.post("/:orgId/auth/password-reset/confirm", async (c) => {
    const orgId = await orgFromParam(c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const parsed = passwordResetConfirmSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "Invalid password reset confirmation payload" }, 400);
    }

    try {
      await service.confirmPasswordReset({
        orgId,
        userId: parsed.data.userId,
        verificationCode: parsed.data.verificationCode,
        newPassword: parsed.data.newPassword,
      });
      return c.json({ data: { ok: true } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Password reset failed";
      return c.json({ error: message }, 400);
    }
  });

  routes.post("/:orgId/auth/register", async (c) => {
    const orgId = await orgFromParam(c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const parsed = registerBodySchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "Invalid registration payload" }, 400);
    }

    try {
      const result = await service.register({
        orgId,
        email: parsed.data.email,
        password: parsed.data.password,
        givenName: parsed.data.givenName,
        familyName: parsed.data.familyName,
      });
      return c.json({ data: result }, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Registration failed";
      const status = message.toLowerCase().includes("already") ? 409 : 400;
      return c.json({ error: message }, status);
    }
  });

  routes.get("/:orgId/auth/session", async (c) => {
    const orgId = await orgFromParam(c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const auth = requireAuthenticatedUser(c);
    if (auth instanceof Response) return auth;

    try {
      const status = await service.getSessionStatus(orgId, auth.userId);
      const projectId = zitadelProjectIdOrNull() ?? undefined;
      const { roles, permissions } = await resolveAuthContextFromAccessToken(auth.userToken, {
        projectId,
        issuer: ZITADEL_ISSUER,
      });
      const teamRole = roles.includes("admin")
        ? "admin"
        : roles.includes("editor")
          ? "editor"
          : null;
      return c.json({
        data: {
          ...status,
          roles,
          permissions,
          teamRole,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Session status failed";
      return c.json({ error: message }, 400);
    }
  });

  routes.get("/:orgId/auth/users", async (c) => {
    const orgId = await orgFromParam(c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const auth = await requireAuthManage(c);
    if (auth instanceof Response) return auth;

    try {
      const users = await service.listTeamUsers(orgId);
      return c.json({ data: users });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to list users";
      return c.json({ error: message }, 400);
    }
  });

  routes.post("/:orgId/auth/users/invite", async (c) => {
    const orgId = await orgFromParam(c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const auth = await requireAuthManage(c);
    if (auth instanceof Response) return auth;

    const parsed = teamInviteSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "Invalid invite payload" }, 400);
    }

    try {
      const result = await service.inviteTeamUser(orgId, parsed.data);
      return c.json({ data: result }, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invite failed";
      const status = message.toLowerCase().includes("already") ? 409 : 400;
      return c.json({ error: message }, status);
    }
  });

  routes.put("/:orgId/auth/users/:userId/role", async (c) => {
    const orgId = await orgFromParam(c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const auth = await requireAuthManage(c);
    if (auth instanceof Response) return auth;

    const parsed = teamRoleUpdateSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "Invalid role payload" }, 400);
    }

    const userId = c.req.param("userId");
    try {
      await service.updateTeamUserRole(orgId, userId, parsed.data.role);
      return c.json({ data: { ok: true } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Role update failed";
      return c.json({ error: message }, 400);
    }
  });

  return routes;
}
