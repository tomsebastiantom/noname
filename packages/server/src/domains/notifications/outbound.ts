import type { Queue } from "bullmq";
import { ServiceUnavailableError } from "../../shared/domain-error";
import { eventBus } from "../../shared/event-bus";
import type { TenantSettingsService } from "../documents/ports";
import type { SecretsService } from "../secrets/ports";
import type { NotificationsStorage } from "./adapters/postgres";
import { CommsEvents } from "./events";
import type { SendEmailInput, SendEmailResult } from "./ports";
import type { NotificationPreferences } from "./preferences";
import type { EmailOutboundJobData } from "./queue";

export type CommsChannel = "email" | "sms" | "in_app";
type CommsTriggerMap = Record<string, { templateId?: string; channels?: CommsChannel[] }>;

export function readTriggerMap(integrations: Record<string, unknown>): CommsTriggerMap {
  const comms = integrations.comms;
  if (!comms || typeof comms !== "object") return {};
  const triggers = (comms as { triggers?: unknown }).triggers;
  if (!triggers || typeof triggers !== "object" || Array.isArray(triggers)) return {};
  return triggers as CommsTriggerMap;
}

export async function resolveTemplateId(
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

export function resolveChannels(
  integrations: Record<string, unknown> | undefined,
  trigger: string,
): CommsChannel[] {
  const mapped = integrations ? readTriggerMap(integrations)[trigger]?.channels : undefined;
  if (mapped && mapped.length > 0) return mapped;
  return ["email"];
}

export async function loadUserPreferences(
  storage: NotificationsStorage,
  orgId: string,
  userId: string,
): Promise<NotificationPreferences> {
  const row = await storage.getPreferences(orgId, userId);
  return row.preferences;
}

export async function queueRenderedSms(
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
    throw new ServiceUnavailableError("SMS requires Twilio comms credentials for org");
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

export async function queueRenderedEmail(
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
