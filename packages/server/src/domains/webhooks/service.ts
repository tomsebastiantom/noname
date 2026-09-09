import { randomBytes } from "node:crypto";
import type { Queue } from "bullmq";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../shared/domain-error";
import type { SecretsService } from "../secrets/ports";
import type { WebhooksStorage } from "./adapters/postgres";
import { toOutboundDeliveryDTO, toSubscriptionDTO } from "./adapters/postgres";
import { buildOutboundWebhookBody } from "./envelope";
import type { WebhookOutboundJobData, WebhooksService } from "./ports";

export function createWebhooksService(deps: {
  storage: WebhooksStorage;
  outboundQueue: Queue<WebhookOutboundJobData>;
  secrets: Pick<SecretsService, "putOrgSecret" | "hasOrgSecret">;
}): WebhooksService {
  const { storage, outboundQueue, secrets } = deps;

  async function subscriptionDto(
    orgId: string,
    row: Awaited<ReturnType<WebhooksStorage["findSubscription"]>>,
  ) {
    if (!row) throw new NotFoundError("Webhook subscription", orgId);
    const hasSigningSecret = await secrets.hasOrgSecret(orgId, "webhooks", row.id);
    return toSubscriptionDTO(row, hasSigningSecret);
  }

  return {

    async listSubscriptions(orgId) {
      const rows = await storage.listSubscriptions(orgId);
      return Promise.all(
        rows.map(async (row) =>
          toSubscriptionDTO(row, await secrets.hasOrgSecret(orgId, "webhooks", row.id)),
        ),
      );
    },

    async upsertSubscription(orgId, subscriptionId, input, _actorId) {
      const url = input.url.trim();
      if (!url.startsWith("https://")) {
        throw new ValidationError("url", "Webhook URL must use HTTPS");
      }

      const eventTypes = input.eventTypes.map((value) => value.trim()).filter(Boolean);
      if (eventTypes.length === 0) {
        throw new ValidationError("eventTypes", "At least one event type is required");
      }

      const signingSecret = input.signingSecret?.trim() || randomBytes(32).toString("base64url");

      if (subscriptionId) {
        const existing = await storage.findSubscription(orgId, subscriptionId);
        if (!existing) {
          throw new NotFoundError("Webhook subscription", subscriptionId ?? orgId);
        }

        const row = await storage.updateSubscription(orgId, subscriptionId, {
          url,
          eventTypes,
          enabled: input.enabled ?? existing.enabled,
          description: input.description ?? existing.description,
        });

        if (input.signingSecret?.trim()) {
          await secrets.putOrgSecret({
            orgId,
            kind: "webhooks",
            provider: row.id,
            payload: { signingSecret },
            updatedBy: _actorId,
          });
        }

        return subscriptionDto(orgId, row);
      }

      const id = crypto.randomUUID();
      const row = await storage.insertSubscription({
        id,
        orgId,
        url,
        eventTypes,
        enabled: input.enabled ?? true,
        description: input.description ?? null,
      });

      await secrets.putOrgSecret({
        orgId,
        kind: "webhooks",
        provider: row.id,
        payload: { signingSecret },
        updatedBy: _actorId,
      });

      return subscriptionDto(orgId, row);
    },

    async deleteSubscription(orgId, subscriptionId) {
      const existing = await storage.findSubscription(orgId, subscriptionId);
      if (!existing) {
        throw new NotFoundError("Webhook subscription", subscriptionId ?? orgId);
      }
      await storage.deleteSubscription(orgId, subscriptionId);
    },

    async deliverOutbound(orgId, eventType, payload, eventId) {
      const resolvedEventId = eventId ?? crypto.randomUUID();
      const subscriptions = await storage.listEnabledSubscriptions(orgId, eventType);
      const deliveryIds: string[] = [];

      for (const sub of subscriptions) {
        const deliveryId = crypto.randomUUID();
        const body = buildOutboundWebhookBody(eventType, resolvedEventId, payload);

        await storage.insertOutboundDelivery({
          id: deliveryId,
          orgId,
          subscriptionId: sub.id,
          eventType,
          eventId: resolvedEventId,
          payload,
          status: "queued",
        });

        await outboundQueue.add(
          "deliver",
          {
            deliveryId,
            orgId,
            subscriptionId: sub.id,
            url: sub.url,
            eventType,
            eventId: resolvedEventId,
            body,
          },
          {
            attempts: 5,
            backoff: { type: "exponential", delay: 5000 },
          },
        );

        deliveryIds.push(deliveryId);
      }

      return { deliveryIds };
    },

    async listOutboundDeliveries(orgId, limit) {
      const rows = await storage.listOutboundDeliveries(orgId, limit);
      return rows.map(toOutboundDeliveryDTO);
    },

    async retryOutboundDelivery(orgId, deliveryId) {
      const row = await storage.findOutboundDeliveryForOrg(orgId, deliveryId);
      if (!row) {
        throw new NotFoundError("Outbound delivery", deliveryId);
      }
      if (row.status !== "failed") {
        throw new ConflictError(`Outbound delivery is not failed: ${row.status}`);
      }

      const subscription = await storage.findSubscription(orgId, row.subscriptionId);
      if (!subscription) {
        throw new NotFoundError("Webhook subscription", row.subscriptionId);
      }
      if (!subscription.enabled) {
        throw new ConflictError("Webhook subscription is disabled");
      }

      const body = buildOutboundWebhookBody(row.eventType, row.eventId, row.payload);

      await storage.updateOutboundDelivery(deliveryId, {
        status: "queued",
        attemptCount: 0,
        error: null,
        lastStatusCode: null,
        deliveredAt: null,
      });

      const job = await outboundQueue.add(
        "deliver",
        {
          deliveryId: row.id,
          orgId,
          subscriptionId: row.subscriptionId,
          url: subscription.url,
          eventType: row.eventType,
          eventId: row.eventId,
          body,
        },
        {
          attempts: 5,
          backoff: { type: "exponential", delay: 5000 },
        },
      );

      return { deliveryId: row.id, jobId: job.id ?? row.id };
    },
  };
}
