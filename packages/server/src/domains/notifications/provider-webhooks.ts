import {
  ServiceUnavailableError,
  UnauthorizedError,
  ValidationError,
} from "../../shared/domain-error";
import type { NotificationsStorage } from "./adapters/postgres";
import { applyCommsWebhookEvent } from "./adapters/webhooks/apply-event";
import { getCommsWebhookAdapter } from "./adapters/webhooks/registry";
import { isCommsDeliveryWebhookEvent } from "./adapters/webhooks/types";

export async function handleProviderWebhook(
  storage: NotificationsStorage,
  provider: string,
  rawBody: string,
  headers: Record<string, string | undefined>,
  options?: { webhookUrl?: string },
) {
  const adapter = getCommsWebhookAdapter(provider);
  if (!adapter) {
    throw new ValidationError("provider", `Unknown comms webhook provider: ${provider}`);
  }

  const parsed = await adapter.parse({
    rawBody,
    headers,
    webhookUrl: options?.webhookUrl,
  });

  if (!parsed) {
    throw new UnauthorizedError(`Invalid ${provider} webhook signature or payload`);
  }

  if ("kind" in parsed && parsed.kind === "subscription_confirmation") {
    await fetch(parsed.subscribeUrl, { method: "GET" });
    return { received: true, matched: false, subscribed: true };
  }

  if (!isCommsDeliveryWebhookEvent(parsed)) {
    throw new UnauthorizedError(`Invalid ${provider} webhook signature or payload`);
  }

  return applyCommsWebhookEvent(storage, parsed);
}

export async function handleResendWebhook(
  storage: NotificationsStorage,
  rawBody: string,
  headers: Record<string, string | undefined>,
) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new ServiceUnavailableError("Resend webhook not configured");
  }
  return handleProviderWebhook(storage, "resend", rawBody, headers);
}
