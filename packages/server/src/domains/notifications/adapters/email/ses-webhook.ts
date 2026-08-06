import { normalizeSesEventType } from "../../delivery-events";
import { verifySnsMessage } from "../webhooks/sns-verify";
import type { CommsWebhookAdapter, CommsWebhookParseInput, CommsWebhookParseResult } from "../webhooks/types";

function readSesEventType(message: Record<string, unknown>): string | null {
  const eventType = message.eventType;
  if (typeof eventType === "string" && eventType.length > 0) {
    return eventType;
  }
  const notificationType = message.notificationType;
  if (typeof notificationType === "string" && notificationType.length > 0) {
    return notificationType;
  }
  return null;
}

function readSesMessageId(message: Record<string, unknown>): string | null {
  const mail = message.mail;
  if (!mail || typeof mail !== "object" || Array.isArray(mail)) {
    return null;
  }
  const messageId = (mail as { messageId?: unknown }).messageId;
  return typeof messageId === "string" && messageId.length > 0 ? messageId : null;
}

function readSesOccurredAt(message: Record<string, unknown>): Date {
  const mail = message.mail;
  if (mail && typeof mail === "object" && !Array.isArray(mail)) {
    const ts = (mail as { timestamp?: unknown }).timestamp;
    if (typeof ts === "string") {
      const parsed = new Date(ts);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }
  return new Date();
}

/** Parses inner SES JSON from an SNS Notification (no signature check). */
export function parseSesEventMessage(message: unknown): CommsWebhookParseResult {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return null;
  }

  const body = message as Record<string, unknown>;
  const nativeType = readSesEventType(body);
  const providerMessageId = readSesMessageId(body);
  if (!nativeType || !providerMessageId) {
    return null;
  }

  const eventType = normalizeSesEventType(nativeType);
  if (!eventType) {
    return null;
  }

  return {
    provider: "ses",
    providerEventId: `${providerMessageId}:${nativeType}`,
    providerMessageId,
    eventType,
    occurredAt: readSesOccurredAt(body),
    rawPayload: body,
  };
}

export function parseSesSnsEnvelope(rawBody: string): {
  sns: Record<string, unknown>;
  inner: CommsWebhookParseResult;
} | null {
  let sns: unknown;
  try {
    sns = JSON.parse(rawBody) as unknown;
  } catch {
    return null;
  }
  if (!sns || typeof sns !== "object" || Array.isArray(sns)) {
    return null;
  }

  const envelope = sns as Record<string, unknown>;
  const type = envelope.Type;
  if (type === "SubscriptionConfirmation") {
    const subscribeUrl = envelope.SubscribeURL;
    if (typeof subscribeUrl === "string" && subscribeUrl.length > 0) {
      return {
        sns: envelope,
        inner: { kind: "subscription_confirmation", subscribeUrl },
      };
    }
    return null;
  }

  if (type !== "Notification") {
    return null;
  }

  const messageRaw = envelope.Message;
  if (typeof messageRaw !== "string") {
    return null;
  }

  let message: unknown;
  try {
    message = JSON.parse(messageRaw) as unknown;
  } catch {
    return null;
  }

  return { sns: envelope, inner: parseSesEventMessage(message) };
}

export function createSesWebhookAdapter(): CommsWebhookAdapter {
  return {
    provider: "ses",
    async parse(input: CommsWebhookParseInput): Promise<CommsWebhookParseResult> {
      const parsed = parseSesSnsEnvelope(input.rawBody);
      if (!parsed) {
        return null;
      }

      if (parsed.inner && "kind" in parsed.inner && parsed.inner.kind === "subscription_confirmation") {
        return parsed.inner;
      }

      const region = process.env.AWS_REGION?.trim();
      const verified = await verifySnsMessage(parsed.sns, {
        expectedRegion: region || undefined,
      });
      if (!verified) {
        return null;
      }

      return parsed.inner;
    },
  };
}
