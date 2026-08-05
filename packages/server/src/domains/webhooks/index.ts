import type { Database } from "../../drizzle";
import { createWebhooksStorage } from "./adapters/postgres";
import { getWebhookInboundQueue } from "./queue";
import { createWebhooksRoutes } from "./routes/inbound";
import { createWebhooksService } from "./service";
import { startWebhookInboundWorker } from "./worker";

export type { WebhooksService, WebhookReceiptDTO } from "./ports";
export { WebhookEvents } from "./events";
export { createWebhooksService } from "./service";

export interface WebhooksDomainDeps {
  db: Database;
  resolveOrgId?: (input: {
    orgId?: string;
    connectionId?: string;
    provider: string;
  }) => Promise<string | null>;
  service?: ReturnType<typeof createWebhooksService>;
}

export function createWebhooksDomain(deps: WebhooksDomainDeps) {
  const storage = createWebhooksStorage(deps.db);
  const queue = getWebhookInboundQueue();
  const service =
    deps.service ??
    createWebhooksService({
      storage,
      queue,
      resolveOrgId: deps.resolveOrgId,
    });
  const worker = startWebhookInboundWorker({ storage });
  const routes = createWebhooksRoutes(service);

  return { service, storage, routes, worker, queue };
}
