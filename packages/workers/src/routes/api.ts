import { Hono } from "hono";
import { validateJwt } from "../auth";
import { fetchSchema, isBot, personalizeSchema } from "../renderer";
import type { EdgeContext, Env } from "../types";

export function createApiRoutes() {
  const routes = new Hono<{ Bindings: Env; Variables: { ctx: EdgeContext } }>();

  routes.use("*", async (c, next) => {
    const result = await validateJwt(c.req.raw, c.env);
    if (result instanceof Response) return result;
    c.set("ctx", result);
    await next();
  });

  routes.get("/*", async (c) => {
    const ctx = c.get("ctx");
    const _pathname = new URL(c.req.url).pathname;

    const segment = c.req.query("segment") || "default";

    // For personalized paths, resolve segment from context engine
    if (!c.req.query("segment")) {
      // Use cached or fallback segment
      const _personalized = await personalizeSchema(
        ctx.orgId,
        c.req.raw,
        c.env,
        ctx.userId,
        ctx.role,
      );
      // Personalization returns segment hash — extract or use default
    }

    const schema = await fetchSchema(ctx.orgId, segment, c.env, ctx.userId, ctx.role);
    if (!schema) {
      return c.json({ error: "Schema not found" }, 404);
    }

    if (isBot(c.req.raw)) {
      // TODO: React 19 SSR
      // const html = await renderToReadableStream(schema);
      return c.html(`<html><body><pre>${JSON.stringify(schema, null, 2)}</pre></body></html>`);
    }

    return c.json(schema);
  });

  return routes;
}
