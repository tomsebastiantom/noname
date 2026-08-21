import type { Queue } from "bullmq";
import { ConflictError, NotFoundError } from "../../shared/domain-error";
import { broadcast } from "../../shared/sse-manager";
import type { ContentDocumentService, TenantSettingsService } from "../documents/ports";
import type { SecretsService } from "../secrets/ports";
import type { NotificationsStorage } from "./adapters/postgres";
import { toDeliveryDTO, toDeliveryEventDTO, toInboxItemDTO } from "./adapters/postgres";
import { loadPublishedNotificationEmail, renderNotificationEmail } from "./email-template";
import {
  applyMarketingEmailCompliance,
  resolveCommunicationPreferencesUrl,
} from "./marketing-compliance";
import {
  loadUserPreferences,
  queueRenderedEmail,
  queueRenderedSms,
  resolveChannels,
  resolveTemplateId,
} from "./outbound";
import type {
  ListDeliveriesQuery,
  NotificationsService,
  NotifyInput,
  SendEmailInput,
  SendEmailResult,
  SendTemplatedEmailInput,
} from "./ports";
import { DEFAULT_NOTIFICATION_PREFERENCES, shouldDeliverNotification } from "./preferences";
import { handleProviderWebhook, handleResendWebhook } from "./provider-webhooks";
import type { EmailOutboundJobData } from "./queue";

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
        throw new NotFoundError("Notification email template", input.templateId);
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
        throw new NotFoundError("Notification template", templateId);
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
      return handleProviderWebhook(storage, provider, rawBody, headers, options);
    },

    async handleResendWebhook(rawBody, headers) {
      return handleResendWebhook(storage, rawBody, headers);
    },

    async retryDelivery(orgId: string, deliveryId: string) {
      const row = await storage.findDelivery(orgId, deliveryId);
      if (!row) {
        throw new NotFoundError("Delivery", deliveryId);
      }
      if (row.status !== "failed") {
        throw new ConflictError(`Delivery is not failed: ${row.status}`);
      }
      if (row.channel === "sms") {
        if (!row.bodyText) {
          throw new ConflictError("SMS delivery has no stored body to retry");
        }
      } else if (!row.bodyHtml || !row.subject) {
        throw new ConflictError("Delivery has no stored content to retry");
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
