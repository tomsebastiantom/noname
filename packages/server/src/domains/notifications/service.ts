import type { Queue } from "bullmq";
import type { ContentDocumentService } from "../documents/ports";
import type { SecretsService } from "../secrets/ports";
import {
  loadPublishedNotificationEmail,
  renderNotificationEmail,
} from "./email-template";
import type { NotificationsStorage } from "./adapters/postgres";
import type {
  NotificationsService,
  SendEmailInput,
  SendTemplatedEmailInput,
} from "./ports";
import type { EmailOutboundJobData } from "./queue";

async function queueRenderedEmail(
  deps: {
    secrets: Pick<SecretsService, "resolveCommsCredentials">;
    storage: NotificationsStorage;
    queue: Queue<EmailOutboundJobData>;
  },
  orgId: string,
  input: SendEmailInput,
): Promise<{ deliveryId: string; jobId: string }> {
  const { secrets, storage, queue } = deps;
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
}

export function createNotificationsService(deps: {
  secrets: Pick<SecretsService, "resolveCommsCredentials">;
  storage: NotificationsStorage;
  queue: Queue<EmailOutboundJobData>;
  content: Pick<ContentDocumentService, "findById" | "findByType" | "resolve">;
}): NotificationsService {
  const { secrets, storage, queue, content } = deps;

  return {
    async enqueueEmail(orgId: string, input: SendEmailInput) {
      return queueRenderedEmail({ secrets, storage, queue }, orgId, input);
    },

    async enqueueTemplatedEmail(orgId: string, input: SendTemplatedEmailInput) {
      const template = await loadPublishedNotificationEmail(
        content,
        orgId,
        input.templateId,
        input.locale ?? "en-US",
      );
      if (!template) {
        throw new Error(`Notification email template not found: ${input.templateId}`);
      }

      if (input.userId) {
        const prefs = await storage.getPreferences(orgId, input.userId);
        if (template.category === "agent" && !prefs.agentTaskEmail) {
          return { deliveryId: "", jobId: "", skipped: true };
        }
        if (template.category === "marketing" && !prefs.marketingEmail) {
          return { deliveryId: "", jobId: "", skipped: true };
        }
      }

      const rendered = await renderNotificationEmail(template, input.variables ?? {});
      return queueRenderedEmail({ secrets, storage, queue }, orgId, {
        to: input.to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        userId: input.userId,
      });
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
