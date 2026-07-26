import { Hono } from "hono";
import { z } from "zod";
import { notFound } from "../../shared/respond";
import { resolveSiteIdToOrgId } from "../../shared/site-id";
import type { TenantSettingsService } from "../documents/ports";
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

import { isSupportedLoginProvider } from "./auth-provider-content";

const authConfigUpdateSchema = z.object({
  providers: z.array(z.enum(["google", "github", "apple"])).optional(),
  idpIds: z.record(z.string(), z.string()).optional(),
  allowPassword: z.boolean().optional(),
  allowSignUp: z.boolean().optional(),
  allowPasswordReset: z.boolean().optional(),
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

  return routes;
}
