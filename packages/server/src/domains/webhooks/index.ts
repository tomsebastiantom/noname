import type { Database } from "../../drizzle";
import type { TenantSettingsService } from "../documents/ports";
import type { SecretsService } from "../secrets/ports";
import { createWebhooksStorage } from "./adapters/postgres";
import { registerWebhookInboundRouter } from "./inbound-router";
import { registerWebhookOutboundRouter } from "./outbound-router";
import { getWebhookInboundQueue, getWebhookOutboundQueue } from "./queue";
import { createWebhooksRoutes } from "./routes/inbound";
import { createWebhookOrgResolver } from "./resolve-org";
import { createWebhooksService } from "./service";
import { startWebhookInboundWorker } from "./worker";
import { startWebhookOutboundWorker } from "./outbound-worker";

export type {
  WebhooksService,
  WebhookReceiptDTO,
  WebhookSubscriptionDTO,
  WebhookOutboundDeliveryDTO,
} from "./ports";
export { WebhookEvents } from "./events";
export { WebhookPlatformEventTypes } from "./outbound-router";
export { createWebhooksService } from "./service";
export { registerWebhookInboundRouter } from "./inbound-router";
export { registerWebhookOutboundRouter } from "./outbound-router";
export { createWebhookOrgResolver } from "./resolve-org";

export interface WebhooksDomainDeps {
  db: Database;
  secrets: Pick<SecretsService, "putOrgSecret" | "hasOrgSecret" | "getOrgSecret">;
  tenantSettings?: Pick<TenantSettingsService, "findOrgIdByOAuthConnectionId">;
  resolveOrgId?: (input: {
    orgId?: string;
    connectionId?: string;
    provider: string;
  }) => Promise<string | null>;
  service?: ReturnType<typeof createWebhooksService>;
}

export function createWebhooksDomain(deps: WebhooksDomainDeps) {
  const storage = createWebhooksStorage(deps.db);
  const inboundQueue = getWebhookInboundQueue();
  const outboundQueue = getWebhookOutboundQueue();
  const resolveOrgId =
    deps.resolveOrgId ??
    (deps.tenantSettings ? createWebhookOrgResolver(deps.tenantSettings) : undefined);
  const service =
    deps.service ??
    createWebhooksService({
      storage,
      inboundQueue,
      outboundQueue,
      secrets: deps.secrets,
      resolveOrgId,
    });
  const inboundWorker = startWebhookInboundWorker({ storage });
  const outboundWorker = startWebhookOutboundWorker({
    storage,
    secrets: deps.secrets,
  });
  const routes = createWebhooksRoutes(service);

  return {
    service,
    storage,
    routes,
    inboundWorker,
    outboundWorker,
    inboundQueue,
    outboundQueue,
  };
}
