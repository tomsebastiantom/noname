import type { Database } from "../../drizzle";
import type { SecretsService } from "../secrets/ports";
import { createNotificationsStorage } from "./adapters/postgres";
import { createNotificationsRoutes } from "./api";
import type { EmailSenderPort } from "./ports";
import { getEmailOutboundQueue } from "./queue";
import { createNotificationsService } from "./service";
import { startEmailOutboundWorker } from "./worker";

export type { NotificationPreferencesDTO, NotificationsService, SendEmailInput } from "./ports";
export { createNotificationsService } from "./service";

export interface NotificationsDomainDeps {
  db: Database;
  secrets: Pick<SecretsService, "resolveCommsCredentials">;
  emailSender?: EmailSenderPort;
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
    });
  const worker = startEmailOutboundWorker({
    storage,
    secrets: deps.secrets,
    emailSender: deps.emailSender,
  });
  const routes = createNotificationsRoutes(service);

  return { service, storage, routes, worker, queue };
}
