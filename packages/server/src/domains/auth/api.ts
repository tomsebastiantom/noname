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

export function createAuthRoutes(service: AuthService) {
  const routes = new Hono();

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
