import { normalizeSendGridEventType } from "../../delivery-events";
import { verifySendGridEventWebhook } from "../webhooks/sendgrid-verify";
import type {
  CommsWebhookAdapter,
  CommsWebhookParseInput,
  CommsWebhookParseResult,
  NormalizedCommsWebhookEvent,
} from "../webhooks/types";

function readPublicKey(): string | null {
  const key = process.env.SENDGRID_WEBHOOK_PUBLIC_KEY?.trim();
  return key || null;
}

function normalizeMessageId(value: string): string {
  const dot = value.indexOf(".");
  return dot > 0 ? value.slice(0, dot) : value;
}

export function parseSendGridWebhookEvent(
  event: Record<string, unknown>,
): NormalizedCommsWebhookEvent | null {
  const nativeEvent = event.event;
  const sgMessageId = event.sg_message_id;
  const sgEventId = event.sg_event_id;
  if (typeof nativeEvent !== "string" || typeof sgMessageId !== "string") {
    return null;
  }

  const eventType = normalizeSendGridEventType(nativeEvent);
  if (!eventType) {
    return null;
  }

  const timestamp = event.timestamp;
  const occurredAt =
    typeof timestamp === "number"
      ? new Date(timestamp * 1000)
      : typeof timestamp === "string"
        ? new Date(Number.parseInt(timestamp, 10) * 1000)
        : new Date();

  const providerEventId =
    typeof sgEventId === "string" && sgEventId.length > 0
      ? sgEventId
      : `${sgMessageId}:${nativeEvent}:${timestamp ?? ""}`;

  return {
    provider: "sendgrid",
    providerEventId,
    providerMessageId: normalizeMessageId(sgMessageId),
    eventType,
    occurredAt: Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt,
    rawPayload: event,
  };
}

export function parseSendGridWebhookBody(rawBody: string): NormalizedCommsWebhookEvent[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody) as unknown;
  } catch {
    return [];
  }

  const events = Array.isArray(parsed) ? parsed : [parsed];
  const normalized: NormalizedCommsWebhookEvent[] = [];
  for (const item of events) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const event = parseSendGridWebhookEvent(item as Record<string, unknown>);
    if (event) normalized.push(event);
  }
  return normalized;
}

export function createSendGridWebhookAdapter(): CommsWebhookAdapter {
  return {
    provider: "sendgrid",
    parse(input: CommsWebhookParseInput): CommsWebhookParseResult {
      const signature =
        input.headers["x-twilio-email-event-webhook-signature"] ??
        input.headers["X-Twilio-Email-Event-Webhook-Signature"];
      const timestamp =
        input.headers["x-twilio-email-event-webhook-timestamp"] ??
        input.headers["X-Twilio-Email-Event-Webhook-Timestamp"];

      const publicKey = readPublicKey();
      if (publicKey) {
        if (!signature || !timestamp) {
          return null;
        }
        if (!verifySendGridEventWebhook(publicKey, input.rawBody, signature, timestamp)) {
          return null;
        }
      }

      const events = parseSendGridWebhookBody(input.rawBody);
      return events[0] ?? null;
    },
  };
}
