import { Hono } from "hono";
import { ok } from "../../../shared/respond";
import type { WebhooksService } from "../ports";

export function createWebhooksRoutes(service: WebhooksService) {
  const routes = new Hono();

  routes.post("/inbound/:provider", async (c) => {
    const provider = c.req.param("provider");
    const rawBody = await c.req.text();
    const headers = Object.fromEntries(c.req.raw.headers.entries()) as Record<
      string,
      string | undefined
    >;

    try {
      const result = await service.handleInbound(provider, rawBody, headers);
      return ok(c, { received: true, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : "webhook rejected";
      if (message.includes("signature") || message.includes("Invalid")) {
        return c.json({ error: message }, 401);
      }
      if (message.includes("not configured")) {
        return c.json({ error: message }, 503);
      }
      return c.json({ error: message }, 400);
    }
  });

  return routes;
}
