import { SpanStatusCode, trace } from "@opentelemetry/api";
import { Worker } from "bullmq";
import { BULLMQ_QUEUES } from "../../shared/bullmq-queues";
import { eventBus } from "../../shared/event-bus";
import { getRedisConnection } from "../../shared/redis";
import { workerConcurrency, workersEnabled } from "../../shared/worker-runtime";
import type { SecretsService } from "../secrets/ports";
import { getEmailSender } from "./adapters/email";
import type { NotificationsStorage } from "./adapters/postgres";
import { CommsEvents } from "./events";
import type { EmailOutboundJobData } from "./queue";

const tracer = trace.getTracer("notifications-worker");

export function startEmailOutboundWorker(deps: {
  storage: NotificationsStorage;
  secrets: Pick<SecretsService, "resolveCommsCredentials">;
}): Worker<EmailOutboundJobData> | null {
  if (!workersEnabled()) return null;

  return new Worker<EmailOutboundJobData>(
    BULLMQ_QUEUES.EMAIL_OUTBOUND,
    async (job) => {
      const { deliveryId, orgId, to, subject, html, text } = job.data;
      const attemptCount = job.attemptsMade + 1;

      await deps.storage.updateDelivery(deliveryId, { attemptCount });

      await tracer.startActiveSpan("notifications.email.send", async (span) => {
        span.setAttribute("notifications.org_id", orgId);
        span.setAttribute("notifications.delivery_id", deliveryId);
        span.setAttribute("notifications.attempt", attemptCount);

        try {
          const row = await deps.storage.findDelivery(orgId, deliveryId);
          if (!row) {
            throw new Error(`Delivery not found: ${deliveryId}`);
          }

          const credentials = await deps.secrets.resolveCommsCredentials(orgId);
          if (!credentials) {
            throw new Error("No comms credentials configured for org");
          }

          if (row.channel === "sms") {
            if (credentials.provider !== "twilio") {
              throw new Error("SMS delivery requires Twilio credentials");
            }
            const { getSmsSender } = await import("./adapters/sms");
            const smsSender = getSmsSender("twilio");
            const result = await smsSender.send(credentials, {
              to,
              body: text ?? row.bodyText ?? "",
            });
            await deps.storage.updateDelivery(deliveryId, {
              status: "sent",
              providerMessageId: result.messageId,
              sentAt: new Date(),
              error: null,
            });
            await eventBus.publish(CommsEvents.SENT, {
              orgId,
              deliveryId,
              provider: result.provider,
              messageId: result.messageId,
            });
            return;
          }

          const emailSender = getEmailSender(credentials.provider);
          const result = await emailSender.send(credentials, {
            to,
            subject,
            html,
            text,
            headers: job.data.headers,
          });

          await deps.storage.updateDelivery(deliveryId, {
            status: "sent",
            providerMessageId: result.messageId,
            sentAt: new Date(),
            error: null,
          });

          await eventBus.publish(CommsEvents.SENT, {
            orgId,
            deliveryId,
            provider: result.provider,
            messageId: result.messageId,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const isFinalAttempt = attemptCount >= (job.opts.attempts ?? 1);

          if (isFinalAttempt) {
            await deps.storage.updateDelivery(deliveryId, {
              status: "failed",
              error: message,
            });
            await eventBus.publish(CommsEvents.FAILED, {
              orgId,
              deliveryId,
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
      concurrency: workerConcurrency("EMAIL_OUTBOUND_WORKER_CONCURRENCY", 4),
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 200 },
    },
  );
}
