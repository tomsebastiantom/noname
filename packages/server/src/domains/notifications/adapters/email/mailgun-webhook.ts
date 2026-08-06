import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeMailgunEventType } from "../../delivery-events";
import type {
  CommsWebhookAdapter,
  CommsWebhookParseInput,
  CommsWebhookParseResult,
  NormalizedCommsWebhookEvent,
} from "../webhooks/types";

function readSigningKey(): string | null {
  const key = process.env.MAILGUN_WEBHOOK_SIGNING_KEY?.trim();
  return key || null;
}

function verifyMailgunSignature(
  timestamp: string,
  token: string,
  signature: string,
  signingKey: string,
): boolean {
  const expected = createHmac("sha256", signingKey)
    .update(timestamp + token)
    .digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export function parseMailgunWebhook(
  body: Record<string, unknown>,
): NormalizedCommsWebhookEvent | null {
  const eventData = body["event-data"];
  if (!eventData || typeof eventData !== "object" || Array.isArray(eventData)) {
    return null;
  }

  const data = eventData as Record<string, unknown>;
  const nativeEvent = data.event;
  if (typeof nativeEvent !== "string") {
    return null;
  }

  const eventType = normalizeMailgunEventType(nativeEvent);
  if (!eventType) {
    return null;
  }

  const message = data.message;
  let providerMessageId: string | null = null;
  if (message && typeof message === "object" && !Array.isArray(message)) {
    const headers = (message as { headers?: Record<string, unknown> }).headers;
    const rawId = headers?.["message-id"];
    if (typeof rawId === "string") {
      providerMessageId = rawId.replace(/^<|>$/g, "");
    }
  }
  if (!providerMessageId && typeof data.id === "string") {
    providerMessageId = data.id;
  }
  if (!providerMessageId) {
    return null;
  }

  const ts = data.timestamp;
  const occurredAt = typeof ts === "number" ? new Date(ts * 1000) : new Date();

  return {
    provider: "mailgun",
    providerEventId: typeof data.id === "string" ? data.id : `${providerMessageId}:${nativeEvent}`,
    providerMessageId,
    eventType,
    occurredAt: Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt,
    rawPayload: body,
  };
}

export function createMailgunWebhookAdapter(): CommsWebhookAdapter {
  return {
    provider: "mailgun",
    parse(input: CommsWebhookParseInput): CommsWebhookParseResult {
      let body: unknown;
      try {
        body = JSON.parse(input.rawBody) as unknown;
      } catch {
        return null;
      }
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return null;
      }

      const record = body as Record<string, unknown>;
      const signingKey = readSigningKey();
      if (signingKey) {
        const sigBlock = record.signature;
        if (!sigBlock || typeof sigBlock !== "object" || Array.isArray(sigBlock)) {
          return null;
        }
        const { timestamp, token, signature } = sigBlock as Record<string, unknown>;
        if (
          typeof timestamp !== "string" ||
          typeof token !== "string" ||
          typeof signature !== "string" ||
          !verifyMailgunSignature(timestamp, token, signature, signingKey)
        ) {
          return null;
        }
      }

      return parseMailgunWebhook(record);
    },
  };
}
