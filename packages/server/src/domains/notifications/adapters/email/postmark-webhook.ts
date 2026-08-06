import { normalizePostmarkEventType } from "../../delivery-events";
import type {
  CommsWebhookAdapter,
  CommsWebhookParseInput,
  CommsWebhookParseResult,
  NormalizedCommsWebhookEvent,
} from "../webhooks/types";

function readWebhookToken(): string | null {
  const token = process.env.POSTMARK_WEBHOOK_TOKEN?.trim();
  return token || null;
}

function headerMatchesToken(headers: Record<string, string | undefined>, token: string): boolean {
  const received =
    headers["x-postmark-token"] ??
    headers["X-Postmark-Token"] ??
    headers["x-postmark-webhook-token"] ??
    headers["X-Postmark-Webhook-Token"];
  return received === token;
}

export function parsePostmarkWebhook(
  body: Record<string, unknown>,
): NormalizedCommsWebhookEvent | null {
  const recordType = body.RecordType;
  const messageId = body.MessageID;
  if (typeof recordType !== "string" || typeof messageId !== "string") {
    return null;
  }

  const eventType = normalizePostmarkEventType(recordType);
  if (!eventType) {
    return null;
  }

  const providerEventId = `${messageId}:${recordType}`;

  return {
    provider: "postmark",
    providerEventId,
    providerMessageId: messageId,
    eventType,
    occurredAt: new Date(),
    rawPayload: body,
  };
}

export function createPostmarkWebhookAdapter(): CommsWebhookAdapter {
  return {
    provider: "postmark",
    parse(input: CommsWebhookParseInput): CommsWebhookParseResult {
      const token = readWebhookToken();
      if (token && !headerMatchesToken(input.headers, token)) {
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

      return parsePostmarkWebhook(body as Record<string, unknown>);
    },
  };
}
