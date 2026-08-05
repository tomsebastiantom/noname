import { SpanStatusCode, trace } from "@opentelemetry/api";
import { Worker } from "bullmq";
import { BULLMQ_QUEUES } from "../../shared/bullmq-queues";
import { eventBus } from "../../shared/event-bus";
import { getRedisConnection } from "../../shared/redis";
import type { SecretsService } from "../secrets/ports";
import type { WebhooksStorage } from "./adapters/postgres";
import { WebhookEvents } from "./events";
import type { WebhookOutboundJobData } from "./ports";
import { signOutboundWebhook } from "./signing";

const tracer = trace.getTracer("webhooks-outbound-worker");
const AUTO_DISABLE_FAILURES = 10;

export function startWebhookOutboundWorker(deps: {
  storage: WebhooksStorage;
  secrets: Pick<SecretsService, "getOrgSecret">;
}): Worker<WebhookOutboundJobData> {
  return new Worker<WebhookOutboundJobData>(
    BULLMQ_QUEUES.WEBHOOK_OUTBOUND,
    async (job) => {
      const { deliveryId, orgId, subscriptionId, url, eventType, eventId, body } = job.data;
      const attemptCount = job.attemptsMade + 1;

      await deps.storage.updateOutboundDelivery(deliveryId, { attemptCount });

      await tracer.startActiveSpan("webhooks.outbound.deliver", async (span) => {
        span.setAttribute("webhooks.delivery_id", deliveryId);
        span.setAttribute("webhooks.org_id", orgId);
        span.setAttribute("webhooks.subscription_id", subscriptionId);
        span.setAttribute("webhooks.event_type", eventType);
        span.setAttribute("webhooks.attempt", attemptCount);

        try {
          const secretRow = await deps.secrets.getOrgSecret(orgId, "webhooks", subscriptionId);
          const signingSecret = secretRow?.signingSecret?.trim();
          if (!signingSecret) {
            throw new Error("Webhook signing secret not configured");
          }

          const timestamp = Math.floor(Date.now() / 1000);
          const headers = signOutboundWebhook(signingSecret, eventId, timestamp, body);

          const response = await fetch(url, {
            method: "POST",
            headers,
            body,
            signal: AbortSignal.timeout(30_000),
          });

          if (!response.ok) {
            throw new Error(`Webhook delivery failed with HTTP ${response.status}`);
          }

          await deps.storage.updateOutboundDelivery(deliveryId, {
            status: "delivered",
            lastStatusCode: response.status,
            deliveredAt: new Date(),
            error: null,
          });

          await deps.storage.updateSubscription(orgId, subscriptionId, {
            consecutiveFailures: 0,
          });

          await eventBus.publish(WebhookEvents.OUTBOUND_SENT, {
            orgId,
            deliveryId,
            subscriptionId,
            eventType,
            eventId,
            statusCode: response.status,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const isFinalAttempt = attemptCount >= (job.opts.attempts ?? 1);
          const statusCode =
            message.match(/HTTP (\d+)/)?.[1] != null
              ? Number(message.match(/HTTP (\d+)/)?.[1])
              : null;

          await deps.storage.updateOutboundDelivery(deliveryId, {
            status: isFinalAttempt ? "failed" : "retrying",
            lastStatusCode: statusCode,
            error: message,
          });

          if (isFinalAttempt) {
            const sub = await deps.storage.findSubscription(orgId, subscriptionId);
            if (sub) {
              const consecutiveFailures = sub.consecutiveFailures + 1;
              await deps.storage.updateSubscription(orgId, subscriptionId, {
                consecutiveFailures,
                enabled: consecutiveFailures >= AUTO_DISABLE_FAILURES ? false : sub.enabled,
              });
            }

            await eventBus.publish(WebhookEvents.OUTBOUND_FAILED, {
              orgId,
              deliveryId,
              subscriptionId,
              eventType,
              eventId,
              error: message,
            });
          }

          span.recordException(err as Error);
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw err;
        } finally {
          span.end();
        }
      });
    },
    {
      connection: getRedisConnection(),
      concurrency: 8,
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 200 },
    },
  );
}
