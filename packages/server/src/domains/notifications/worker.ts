import { SpanStatusCode, trace } from "@opentelemetry/api";
import { Worker } from "bullmq";
import { BULLMQ_QUEUES } from "../../shared/bullmq-queues";
import { getRedisConnection } from "../../shared/redis";
import type { SecretsService } from "../secrets/ports";
import type { NotificationsStorage } from "./adapters/postgres";
import { createResendEmailSender } from "./adapters/resend";
import type { EmailSenderPort } from "./ports";
import type { EmailOutboundJobData } from "./queue";

const tracer = trace.getTracer("notifications-worker");

export function startEmailOutboundWorker(deps: {
  storage: NotificationsStorage;
  secrets: Pick<SecretsService, "resolveCommsCredentials">;
  emailSender?: EmailSenderPort;
}): Worker<EmailOutboundJobData> {
  const emailSender = deps.emailSender ?? createResendEmailSender();

  return new Worker<EmailOutboundJobData>(
    BULLMQ_QUEUES.EMAIL_OUTBOUND,
    async (job) => {
      const { deliveryId, orgId, to, subject, html, text } = job.data;

      await tracer.startActiveSpan("notifications.email.send", async (span) => {
        span.setAttribute("notifications.org_id", orgId);
        span.setAttribute("notifications.delivery_id", deliveryId);

        try {
          const credentials = await deps.secrets.resolveCommsCredentials(orgId);
          if (!credentials) {
            throw new Error("No comms credentials configured for org");
          }

          const result = await emailSender.send(credentials, {
            to,
            subject,
            html,
            text,
          });

          await deps.storage.updateDelivery(deliveryId, {
            status: "sent",
            providerMessageId: result.messageId,
            sentAt: new Date(),
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await deps.storage.updateDelivery(deliveryId, {
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
      concurrency: 2,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 },
    },
  );
}
