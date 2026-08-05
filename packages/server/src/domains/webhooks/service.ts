import type { Queue } from "bullmq";
import { createGenericHmacAdapter } from "./adapters/generic-hmac";
import type { WebhooksStorage } from "./adapters/postgres";
import { createStripeWebhookAdapter } from "./adapters/stripe";
import type { InboundWebhookAdapter, WebhookInboundJobData, WebhooksService } from "./ports";

function adapterForProvider(provider: string): InboundWebhookAdapter | null {
  switch (provider) {
    case "stripe": {
      const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
      return secret ? createStripeWebhookAdapter(secret) : null;
    }
    case "generic": {
      const secret = process.env.WEBHOOK_GENERIC_SECRET?.trim();
      return secret ? createGenericHmacAdapter(secret) : null;
    }
    default:
      return null;
  }
}

export function createWebhooksService(deps: {
  storage: WebhooksStorage;
  queue: Queue<WebhookInboundJobData>;
  resolveOrgId?: (input: {
    orgId?: string;
    connectionId?: string;
    provider: string;
  }) => Promise<string | null>;
}): WebhooksService {
  const { storage, queue, resolveOrgId } = deps;

  return {
    async handleInbound(provider, rawBody, headers) {
      const adapter = adapterForProvider(provider);
      if (!adapter) {
        throw new Error(`Webhook provider not configured: ${provider}`);
      }

      if (!adapter.verify(rawBody, headers)) {
        throw new Error("Invalid webhook signature");
      }

      const normalized = adapter.normalize(rawBody);
      let orgId = normalized.orgId ?? null;
      if (!orgId && normalized.connectionId && resolveOrgId) {
        orgId = await resolveOrgId({
          orgId: normalized.orgId,
          connectionId: normalized.connectionId,
          provider,
        });
      }

      const { row, duplicate } = await storage.insertReceipt({
        orgId,
        provider,
        externalEventId: normalized.externalEventId,
        eventType: normalized.eventType,
        status: "received",
        payload: normalized.payload,
      });

      if (duplicate) {
        return { receiptId: row.id, duplicate: true };
      }

      await queue.add("process", {
        receiptId: row.id,
        orgId,
        provider,
        eventType: normalized.eventType,
        payload: normalized.payload,
      });

      return { receiptId: row.id, duplicate: false };
    },
  };
}
