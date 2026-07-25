import { Hono } from "hono";
import { z } from "zod";
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

const SUPPORTED_PROVIDERS = new Set(["google", "github", "apple"]);

const authConfigUpdateSchema = z.object({
  providers: z.array(z.enum(["google", "github", "apple"])).optional(),
  idpIds: z.record(z.string(), z.string()).optional(),
  allowPassword: z.boolean().optional(),
  googleOAuth: z
    .object({
      clientId: z.string().min(1),
      clientSecret: z.string().min(1),
    })
    .optional(),
});

export function createAuthRoutes(service: AuthService) {
  const routes = new Hono();

  routes.get("/:orgId/auth/config", async (c) => {
    const orgId = c.req.param("orgId");
    const config = await service.getConfig(orgId);
    return c.json({ data: config });
  });

  routes.put("/:orgId/auth/config", async (c) => {
    const orgId = c.req.param("orgId");
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
    const orgId = c.req.param("orgId");
    const provider = c.req.param("provider");
    if (!SUPPORTED_PROVIDERS.has(provider)) {
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
    const orgId = c.req.param("orgId");
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

  return routes;
}
