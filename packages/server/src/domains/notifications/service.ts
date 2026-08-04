import type { Queue } from "bullmq";
import type { SecretsService } from "../secrets/ports";
import type { NotificationsStorage } from "./adapters/postgres";
import type { NotificationsService, SendEmailInput } from "./ports";
import type { EmailOutboundJobData } from "./queue";

export function createNotificationsService(deps: {
  secrets: Pick<SecretsService, "resolveCommsCredentials">;
  storage: NotificationsStorage;
  queue: Queue<EmailOutboundJobData>;
}): NotificationsService {
  const { secrets, storage, queue } = deps;

  return {
    async enqueueEmail(orgId: string, input: SendEmailInput) {
      const credentials = await secrets.resolveCommsCredentials(orgId);
      const provider = credentials?.provider ?? "resend";

      const deliveryId = crypto.randomUUID();
      await storage.insertDelivery({
        id: deliveryId,
        orgId,
        userId: input.userId ?? null,
        channel: "email",
        provider,
        toAddress: input.to,
        subject: input.subject,
        status: "queued",
      });

      const job = await queue.add("send", {
        deliveryId,
        orgId,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        userId: input.userId,
      });

      return { deliveryId, jobId: job.id ?? deliveryId };
    },

    async getPreferences(orgId, userId) {
      const row = await storage.getPreferences(orgId, userId);
      return {
        agentTaskEmail: row.agentTaskEmail,
        marketingEmail: row.marketingEmail,
      };
    },

    async updatePreferences(orgId, userId, patch) {
      const row = await storage.upsertPreferences(orgId, userId, patch);
      return {
        agentTaskEmail: row.agentTaskEmail,
        marketingEmail: row.marketingEmail,
      };
    },
  };
}
