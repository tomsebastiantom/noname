import type { Queue } from "bullmq";
import type { TenantSettingsService } from "../documents/ports";
import { eventBus } from "../../shared/event-bus";
import type { SecretsService } from "../secrets/ports";
import { toDeliveryDTO } from "./adapters/postgres";
import type { NotificationsStorage } from "./adapters/postgres";
import {
  loadPublishedNotificationEmail,
  renderNotificationEmail,
} from "./email-template";
import { CommsEvents } from "./events";
import type {
  ListDeliveriesQuery,
  NotificationsService,
  NotifyInput,
  SendEmailInput,
  SendEmailResult,
  SendTemplatedEmailInput,
} from "./ports";
import type { EmailOutboundJobData } from "./queue";

type CommsTriggerMap = Record<string, { templateId?: string }>;

function readTriggerMap(integrations: Record<string, unknown>): CommsTriggerMap {
  const comms = integrations.comms;
  if (!comms || typeof comms !== "object") return {};
  const triggers = (comms as { triggers?: unknown }).triggers;
  if (!triggers || typeof triggers !== "object" || Array.isArray(triggers)) return {};
  return triggers as CommsTriggerMap;
}

async function resolveTemplateId(
  tenantSettings: Pick<TenantSettingsService, "get"> | undefined,
  orgId: string,
  trigger: string,
): Promise<string> {
  if (tenantSettings) {
    const settings = await tenantSettings.get(orgId);
    const mapped = readTriggerMap(settings.integrations as Record<string, unknown>)[trigger]
      ?.templateId;
    if (mapped) return mapped;
  }
  return trigger;
}

async function queueRenderedEmail(
  deps: {
    secrets: Pick<SecretsService, "resolveCommsCredentials">;
    storage: NotificationsStorage;
    queue: Queue<EmailOutboundJobData>;
  },
  orgId: string,
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const { secrets, storage, queue } = deps;

  if (input.idempotencyKey) {
    const existing = await storage.findDeliveryByIdempotency(orgId, input.idempotencyKey);
    if (existing) {
      return { deliveryId: existing.id, jobId: existing.id, duplicate: true };
    }
  }

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
    trigger: input.trigger ?? null,
    templateId: input.templateId ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
    bodyHtml: input.html,
    bodyText: input.text ?? null,
  });

  const job = await queue.add(
    "send",
    {
      deliveryId,
      orgId,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      userId: input.userId,
    },
    input.idempotencyKey ? { jobId: `comms:${orgId}:${input.idempotencyKey}` } : undefined,
  );

  await eventBus.publish(CommsEvents.ENQUEUED, {
    orgId,
    deliveryId,
    channel: "email",
    trigger: input.trigger,
    templateId: input.templateId,
  });

  return { deliveryId, jobId: job.id ?? deliveryId };
}

export function createNotificationsService(deps: {
  secrets: Pick<SecretsService, "resolveCommsCredentials">;
  storage: NotificationsStorage;
  queue: Queue<EmailOutboundJobData>;
  content: Pick<
    import("../documents/ports").ContentDocumentService,
    "findById" | "findByType" | "resolve"
  >;
  tenantSettings?: Pick<TenantSettingsService, "get">;
}): NotificationsService {
  const { secrets, storage, queue, content, tenantSettings } = deps;
  const queueDeps = { secrets, storage, queue };

  return {
    async enqueueEmail(orgId: string, input: SendEmailInput) {
      return queueRenderedEmail(queueDeps, orgId, input);
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
      return queueRenderedEmail(queueDeps, orgId, {
        to: input.to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        userId: input.userId,
        trigger: input.trigger,
        templateId: input.templateId,
        idempotencyKey: input.idempotencyKey,
      });
    },

    async notify(orgId: string, input: NotifyInput) {
      const templateId = await resolveTemplateId(tenantSettings, orgId, input.trigger);
      return this.enqueueTemplatedEmail(orgId, {
        to: input.to,
        templateId,
        variables: input.variables,
        userId: input.userId,
        locale: input.locale,
        trigger: input.trigger,
        idempotencyKey: input.idempotencyKey,
      });
    },

    async listDeliveries(orgId: string, query?: ListDeliveriesQuery) {
      const rows = await storage.listDeliveries(orgId, query);
      return rows.map(toDeliveryDTO);
    },

    async retryDelivery(orgId: string, deliveryId: string) {
      const row = await storage.findDelivery(orgId, deliveryId);
      if (!row) {
        throw new Error(`Delivery not found: ${deliveryId}`);
      }
      if (row.status !== "failed") {
        throw new Error(`Delivery is not failed: ${row.status}`);
      }
      if (!row.bodyHtml || !row.subject) {
        throw new Error("Delivery has no stored content to retry");
      }

      await storage.updateDelivery(deliveryId, {
        status: "queued",
        error: null,
        attemptCount: 0,
      });

      const job = await queue.add("send", {
        deliveryId: row.id,
        orgId,
        to: row.toAddress,
        subject: row.subject,
        html: row.bodyHtml,
        text: row.bodyText ?? undefined,
        userId: row.userId ?? undefined,
      });

      return { deliveryId: row.id, jobId: job.id ?? row.id };
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
