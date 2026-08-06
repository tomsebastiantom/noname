import type { Queue } from "bullmq";
import { eventBus } from "../../shared/event-bus";
import { broadcast } from "../../shared/sse-manager";
import type { ContentDocumentService, TenantSettingsService } from "../documents/ports";
import type { SecretsService } from "../secrets/ports";
import type { NotificationsStorage } from "./adapters/postgres";
import { toDeliveryDTO, toDeliveryEventDTO, toInboxItemDTO } from "./adapters/postgres";
import { applyCommsWebhookEvent } from "./adapters/webhooks/apply-event";
import { getCommsWebhookAdapter } from "./adapters/webhooks/registry";
import { isCommsDeliveryWebhookEvent } from "./adapters/webhooks/types";
import { loadPublishedNotificationEmail, renderNotificationEmail } from "./email-template";
import { CommsEvents } from "./events";
import {
  applyMarketingEmailCompliance,
  resolveCommunicationPreferencesUrl,
} from "./marketing-compliance";
import type {
  ListDeliveriesQuery,
  NotificationsService,
  NotifyInput,
  SendEmailInput,
  SendEmailResult,
  SendTemplatedEmailInput,
} from "./ports";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
  shouldDeliverNotification,
} from "./preferences";
import type { EmailOutboundJobData } from "./queue";

type CommsChannel = "email" | "sms" | "in_app";
type CommsTriggerMap = Record<string, { templateId?: string; channels?: CommsChannel[] }>;

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

function resolveChannels(
  integrations: Record<string, unknown> | undefined,
  trigger: string,
): CommsChannel[] {
  const mapped = integrations ? readTriggerMap(integrations)[trigger]?.channels : undefined;
  if (mapped && mapped.length > 0) return mapped;
  return ["email"];
}

async function loadUserPreferences(
  storage: NotificationsStorage,
  orgId: string,
  userId: string,
): Promise<NotificationPreferences> {
  const row = await storage.getPreferences(orgId, userId);
  return row.preferences;
}

async function queueRenderedSms(
  deps: {
    secrets: Pick<SecretsService, "resolveCommsCredentials">;
    storage: NotificationsStorage;
    queue: Queue<EmailOutboundJobData>;
  },
  orgId: string,
  input: {
    to: string;
    body: string;
    userId?: string;
    trigger?: string;
    templateId?: string;
    idempotencyKey?: string;
  },
): Promise<SendEmailResult> {
  const { secrets, storage, queue } = deps;

  if (input.idempotencyKey) {
    const existing = await storage.findDeliveryByIdempotency(orgId, input.idempotencyKey);
    if (existing) {
      return { deliveryId: existing.id, jobId: existing.id, duplicate: true };
    }
  }

  const credentials = await secrets.resolveCommsCredentials(orgId);
  if (credentials?.provider !== "twilio") {
    throw new Error("SMS requires Twilio comms credentials for org");
  }

  const deliveryId = crypto.randomUUID();
  await storage.insertDelivery({
    id: deliveryId,
    orgId,
    userId: input.userId ?? null,
    channel: "sms",
    provider: "twilio",
    toAddress: input.to,
    subject: null,
    status: "queued",
    trigger: input.trigger ?? null,
    templateId: input.templateId ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
    bodyHtml: null,
    bodyText: input.body,
  });

  const job = await queue.add(
    "send",
    {
      deliveryId,
      orgId,
      to: input.to,
      subject: "",
      html: "",
      text: input.body,
      userId: input.userId,
    },
    input.idempotencyKey ? { jobId: `comms:${orgId}:${input.idempotencyKey}` } : undefined,
  );

  await eventBus.publish(CommsEvents.ENQUEUED, {
    orgId,
    deliveryId,
    channel: "sms",
    trigger: input.trigger,
    templateId: input.templateId,
  });

  return { deliveryId, jobId: job.id ?? deliveryId };
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
      headers: input.headers,
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
  content: Pick<ContentDocumentService, "findById" | "findByType" | "resolve">;
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
        const preferences = await loadUserPreferences(storage, orgId, input.userId);
        if (
          !shouldDeliverNotification({
            channel: "email",
            category: template.category,
            trigger: input.trigger,
            preferences,
          })
        ) {
          return { deliveryId: "", jobId: "", skipped: true };
        }
      }

      const rendered = await renderNotificationEmail(template, input.variables ?? {});

      let emailPayload = rendered;
      let emailHeaders: Record<string, string> | undefined;
      if (template.category === "marketing") {
        const settings = tenantSettings ? await tenantSettings.get(orgId) : null;
        const prefsUrl = resolveCommunicationPreferencesUrl(settings?.slug ?? null);
        const compliant = applyMarketingEmailCompliance(rendered, prefsUrl);
        emailPayload = {
          subject: compliant.subject,
          html: compliant.html,
          text: compliant.text,
        };
        emailHeaders = compliant.headers;
      }

      return queueRenderedEmail(queueDeps, orgId, {
        to: input.to,
        subject: emailPayload.subject,
        html: emailPayload.html,
        text: emailPayload.text,
        userId: input.userId,
        trigger: input.trigger,
        templateId: input.templateId,
        idempotencyKey: input.idempotencyKey,
        headers: emailHeaders,
      });
    },

    async notify(orgId: string, input: NotifyInput) {
      const settings = tenantSettings ? await tenantSettings.get(orgId) : null;
      const integrations = settings?.integrations as Record<string, unknown> | undefined;
      const templateId = await resolveTemplateId(tenantSettings, orgId, input.trigger);
      const channels = resolveChannels(integrations, input.trigger);

      const template = await loadPublishedNotificationEmail(
        content,
        orgId,
        templateId,
        input.locale ?? "en-US",
      );
      if (!template) {
        throw new Error(`Notification template not found: ${templateId}`);
      }

      const preferences = input.userId
        ? await loadUserPreferences(storage, orgId, input.userId)
        : DEFAULT_NOTIFICATION_PREFERENCES;

      const rendered = await renderNotificationEmail(template, input.variables ?? {});
      let last: SendEmailResult = { deliveryId: "", jobId: "", skipped: true };

      if (
        channels.includes("email") &&
        input.to &&
        shouldDeliverNotification({
          channel: "email",
          category: template.category,
          trigger: input.trigger,
          preferences,
        })
      ) {
        last = await this.enqueueTemplatedEmail(orgId, {
          to: input.to,
          templateId,
          variables: input.variables,
          userId: input.userId,
          locale: input.locale,
          trigger: input.trigger,
          idempotencyKey: input.idempotencyKey,
        });
      }

      if (
        channels.includes("in_app") &&
        input.userId &&
        shouldDeliverNotification({
          channel: "in_app",
          category: template.category,
          trigger: input.trigger,
          preferences,
        })
      ) {
        const itemId = crypto.randomUUID();
        const item = await storage.insertInboxItem({
          id: itemId,
          orgId,
          userId: input.userId,
          title: rendered.subject,
          body: rendered.text ?? rendered.subject,
          trigger: input.trigger,
          metadata: { templateId, variables: input.variables ?? {} },
        });
        broadcast(orgId, {
          type: "comms.inbox",
          userId: input.userId,
          item: toInboxItemDTO(item),
        });
        last = { deliveryId: itemId, jobId: itemId };
      }

      const phone = input.phone ?? input.variables?.phone;
      if (
        channels.includes("sms") &&
        phone &&
        shouldDeliverNotification({
          channel: "sms",
          category: template.category,
          trigger: input.trigger,
          preferences,
        })
      ) {
        const smsKey = input.idempotencyKey ? `${input.idempotencyKey}:sms` : undefined;
        last = await queueRenderedSms(queueDeps, orgId, {
          to: phone,
          body: rendered.text ?? rendered.subject,
          userId: input.userId,
          trigger: input.trigger,
          templateId,
          idempotencyKey: smsKey,
        });
      }

      return last;
    },

    async listDeliveries(orgId: string, query?: ListDeliveriesQuery) {
      const rows = await storage.listDeliveries(orgId, query);
      if (!query?.includeEvents) {
        return rows.map((row) => toDeliveryDTO(row));
      }

      const deliveryIds = rows.map((row) => row.id);
      const eventRows = await storage.listDeliveryEventsForDeliveries(deliveryIds);
      const eventsByDelivery = new Map<string, ReturnType<typeof toDeliveryEventDTO>[]>();
      for (const eventRow of eventRows) {
        const dto = toDeliveryEventDTO(eventRow);
        const list = eventsByDelivery.get(eventRow.deliveryId) ?? [];
        list.push(dto);
        eventsByDelivery.set(eventRow.deliveryId, list);
      }

      return rows.map((row) => toDeliveryDTO(row, eventsByDelivery.get(row.id) ?? []));
    },

    async handleProviderWebhook(
      provider: string,
      rawBody: string,
      headers: Record<string, string | undefined>,
      options?: { webhookUrl?: string },
    ) {
      const adapter = getCommsWebhookAdapter(provider);
      if (!adapter) {
        throw new Error(`Unknown comms webhook provider: ${provider}`);
      }

      const parsed = await adapter.parse({
        rawBody,
        headers,
        webhookUrl: options?.webhookUrl,
      });

      if (!parsed) {
        throw new Error(`Invalid ${provider} webhook signature or payload`);
      }

      if ("kind" in parsed && parsed.kind === "subscription_confirmation") {
        await fetch(parsed.subscribeUrl, { method: "GET" });
        return { received: true, matched: false, subscribed: true };
      }

      if (!isCommsDeliveryWebhookEvent(parsed)) {
        throw new Error(`Invalid ${provider} webhook signature or payload`);
      }

      return applyCommsWebhookEvent(storage, parsed);
    },

    async handleResendWebhook(rawBody, headers) {
      const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
      if (!secret) {
        throw new Error("Resend webhook not configured");
      }
      return this.handleProviderWebhook("resend", rawBody, headers);
    },

    async retryDelivery(orgId: string, deliveryId: string) {
      const row = await storage.findDelivery(orgId, deliveryId);
      if (!row) {
        throw new Error(`Delivery not found: ${deliveryId}`);
      }
      if (row.status !== "failed") {
        throw new Error(`Delivery is not failed: ${row.status}`);
      }
      if (row.channel === "sms") {
        if (!row.bodyText) {
          throw new Error("SMS delivery has no stored body to retry");
        }
      } else if (!row.bodyHtml || !row.subject) {
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
        subject: row.subject ?? "",
        html: row.bodyHtml ?? "",
        text: row.bodyText ?? undefined,
        userId: row.userId ?? undefined,
      });

      return { deliveryId: row.id, jobId: job.id ?? row.id };
    },

    async listInbox(orgId, userId, query) {
      const rows = await storage.listInboxItems(orgId, userId, query);
      return rows.map(toInboxItemDTO);
    },

    async markInboxRead(orgId, userId, itemId) {
      const row = await storage.markInboxRead(orgId, userId, itemId);
      return row ? toInboxItemDTO(row) : null;
    },

    async getPreferences(orgId, userId) {
      const row = await storage.getPreferences(orgId, userId);
      return row.preferences;
    },

    async updatePreferences(orgId, userId, patch) {
      const row = await storage.upsertPreferences(orgId, userId, patch);
      return row.preferences;
    },
  };
}
