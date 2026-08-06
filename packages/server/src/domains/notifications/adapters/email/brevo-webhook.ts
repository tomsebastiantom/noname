import { normalizeBrevoEventType } from "../../delivery-events";
import type {
  CommsWebhookAdapter,
  CommsWebhookParseInput,
  CommsWebhookParseResult,
  NormalizedCommsWebhookEvent,
} from "../webhooks/types";

function readWebhookSecret(): string | null {
  const secret = process.env.BREVO_WEBHOOK_SECRET?.trim();
  return secret || null;
}

function headerMatchesSecret(
  headers: Record<string, string | undefined>,
  secret: string,
): boolean {
  const received =
    headers["x-brevo-secret"] ??
    headers["X-Brevo-Secret"] ??
    headers["x-webhook-secret"] ??
    headers["X-Webhook-Secret"];
  return received === secret;
}

export function parseBrevoWebhook(body: Record<string, unknown>): NormalizedCommsWebhookEvent | null {
  const nativeEvent = body.event;
  const messageId = body["message-id"] ?? body.messageId;
  if (typeof nativeEvent !== "string" || typeof messageId !== "string") {
    return null;
  }

  const eventType = normalizeBrevoEventType(nativeEvent);
  if (!eventType) {
    return null;
  }

  const date = body.date;
  const occurredAt = typeof date === "string" ? new Date(date) : new Date();
  const tsEvent = body.ts_event;
  const id = body.id;
  const providerEventId =
    typeof tsEvent === "number"
      ? `${messageId}:${nativeEvent}:${tsEvent}`
      : typeof id === "string" || typeof id === "number"
        ? String(id)
        : `${messageId}:${nativeEvent}`;

  return {
    provider: "brevo",
    providerEventId,
    providerMessageId: messageId,
    eventType,
    occurredAt: Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt,
    rawPayload: body,
  };
}

export function createBrevoWebhookAdapter(): CommsWebhookAdapter {
  return {
    provider: "brevo",
    parse(input: CommsWebhookParseInput): CommsWebhookParseResult {
      const secret = readWebhookSecret();
      if (secret && !headerMatchesSecret(input.headers, secret)) {
        return null;
      }

      let body: unknown;
      try {
        body = JSON.parse(input.rawBody) as unknown;
      } catch {
        return null;
      }
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return null;
      }

      return parseBrevoWebhook(body as Record<string, unknown>);
    },
  };
}
