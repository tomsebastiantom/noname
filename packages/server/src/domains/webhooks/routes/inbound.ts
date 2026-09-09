import { Hono } from "hono";
import type { WebhooksService } from "../ports";
import { registerWebhookSubscriptionRoutes } from "./subscriptions";

export function createWebhooksRoutes(service: WebhooksService) {
  const routes = new Hono();

  registerWebhookSubscriptionRoutes(routes, service);

  return routes;
}
