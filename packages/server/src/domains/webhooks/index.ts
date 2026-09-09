import type { Database } from "../../drizzle";
import type { SecretsService } from "../secrets/ports";
import { createWebhooksStorage } from "./adapters/postgres";
import { startWebhookOutboundWorker } from "./outbound-worker";
import { getWebhookOutboundQueue } from "./queue";
import { createWebhooksRoutes } from "./routes/inbound";
import { createWebhooksService } from "./service";
export { WebhookEvents } from "./events";
export { registerWebhookOutboundRouter, WebhookPlatformEventTypes } from "./outbound-router";
export type { WebhookOutboundDeliveryDTO, WebhookSubscriptionDTO, WebhooksService } from "./ports";
export { createWebhooksService } from "./service";

export interface WebhooksDomainDeps {
  db: Database;
  secrets: Pick<SecretsService, "putOrgSecret" | "hasOrgSecret" | "getOrgSecret">;
  service?: ReturnType<typeof createWebhooksService>;
}

export function createWebhooksDomain(deps: WebhooksDomainDeps) {
  const storage = createWebhooksStorage(deps.db);
  const outboundQueue = getWebhookOutboundQueue();
  const service =
    deps.service ??
    createWebhooksService({
      storage,
      outboundQueue,
      secrets: deps.secrets,
    });
  const outboundWorker = startWebhookOutboundWorker({
    storage,
    secrets: deps.secrets,
  });
  const routes = createWebhooksRoutes(service);

  return {
    service,
    storage,
    routes,
    outboundWorker,
    outboundQueue,
  };
}
