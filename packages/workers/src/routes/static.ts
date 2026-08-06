import { Hono } from "hono";
import type { Env } from "../types";

export function createStaticRoutes() {
  const routes = new Hono<{ Bindings: Env }>();

  routes.get("/_assets/*", async (c) => {
    const key = new URL(c.req.url).pathname.replace(/^\//, "");
    const object = await c.env.R2.get(key);
    if (!object) return c.notFound();

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Cache-Control", "public, max-age=31536000, immutable");

    return new Response(object.body, { headers });
  });

  return routes;
}
