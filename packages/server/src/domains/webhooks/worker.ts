import { SpanStatusCode, trace } from "@opentelemetry/api";
import { Worker } from "bullmq";
import { BULLMQ_QUEUES } from "../../shared/bullmq-queues";
import { eventBus } from "../../shared/event-bus";
import { getRedisConnection } from "../../shared/redis";
import { workerConcurrency, workersEnabled } from "../../shared/worker-runtime";
import type { WebhooksStorage } from "./adapters/postgres";
import { WebhookEvents } from "./events";
import type { WebhookInboundJobData } from "./ports";

const tracer = trace.getTracer("webhooks-worker");

export function startWebhookInboundWorker(deps: {
  storage: WebhooksStorage;
}): Worker<WebhookInboundJobData> | null {
  if (!workersEnabled()) return null;

  return new Worker<WebhookInboundJobData>(
    BULLMQ_QUEUES.WEBHOOK_INBOUND,
    async (job) => {
      const { receiptId, orgId, provider, eventType, payload } = job.data;

      await tracer.startActiveSpan("webhooks.inbound.process", async (span) => {
        span.setAttribute("webhooks.receipt_id", receiptId);
        span.setAttribute("webhooks.provider", provider);
        span.setAttribute("webhooks.event_type", eventType);
        if (orgId) span.setAttribute("webhooks.org_id", orgId);

        try {
          await eventBus.publish(WebhookEvents.RECEIVED, {
            receiptId,
            orgId,
            provider,
            eventType,
            payload,
          });

          await deps.storage.updateReceipt(receiptId, {
            status: "processed",
            processedAt: new Date(),
            error: null,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await deps.storage.updateReceipt(receiptId, {
            status: "failed",
            error: message,
          });
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
      concurrency: workerConcurrency("WEBHOOK_INBOUND_WORKER_CONCURRENCY", 4),
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 200 },
    },
  );
}
