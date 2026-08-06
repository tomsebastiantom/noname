import type { Hono } from "hono";
import { ok } from "../../../shared/respond";
import type { NotificationsService } from "../ports";

function mapWebhookError(err: unknown): Response {
  const message = err instanceof Error ? err.message : "webhook rejected";
  if (message.includes("signature") || message.includes("Invalid")) {
    return new Response(JSON.stringify({ error: message }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (message.includes("not configured") || message.includes("Unknown comms webhook")) {
    return new Response(JSON.stringify({ error: message }), {
      status: message.includes("Unknown") ? 404 : 503,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
}

export function registerCommsWebhookRoutes(
  routes: Hono,
  service: NotificationsService,
): void {
  routes.post("/webhooks/:provider", async (c) => {
    const provider = c.req.param("provider");
    const rawBody = await c.req.text();
    const headers = Object.fromEntries(c.req.raw.headers.entries()) as Record<
      string,
      string | undefined
    >;

    try {
      const result = await service.handleProviderWebhook(provider, rawBody, headers, {
        webhookUrl: c.req.url,
      });
      return ok(c, result);
    } catch (err) {
      return mapWebhookError(err);
    }
  });
}
