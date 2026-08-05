import type { Database } from "../../drizzle";
import type { ContentDocumentService, TenantSettingsService } from "../documents/ports";
import type { SecretsService } from "../secrets/ports";
import { createNotificationsStorage } from "./adapters/postgres";
import { createNotificationsRoutes } from "./api";
import { getEmailOutboundQueue } from "./queue";
import { createNotificationsService } from "./service";
import { startEmailOutboundWorker } from "./worker";

export { CommsEvents } from "./events";
export type {
  CommsDeliveryDTO,
  NotificationPreferencesDTO,
  NotificationsService,
  NotifyInput,
  SendEmailInput,
  SendTemplatedEmailInput,
} from "./ports";
export { createNotificationsService } from "./service";
export { parseTransitionNotify } from "./transition-notify";

export interface NotificationsDomainDeps {
  db: Database;
  secrets: Pick<SecretsService, "resolveCommsCredentials">;
  content: Pick<ContentDocumentService, "findById" | "findByType" | "resolve">;
  tenantSettings?: Pick<TenantSettingsService, "get">;
  service?: ReturnType<typeof createNotificationsService>;
}

export function createNotificationsDomain(deps: NotificationsDomainDeps) {
  const storage = createNotificationsStorage(deps.db);
  const queue = getEmailOutboundQueue();
  const service =
    deps.service ??
    createNotificationsService({
      secrets: deps.secrets,
      storage,
      queue,
      content: deps.content,
      tenantSettings: deps.tenantSettings,
    });
  const worker = startEmailOutboundWorker({
    storage,
    secrets: deps.secrets,
  });
  const routes = createNotificationsRoutes(service);

  return { service, storage, routes, worker, queue };
}
