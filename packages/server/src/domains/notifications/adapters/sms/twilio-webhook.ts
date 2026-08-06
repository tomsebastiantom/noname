import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeTwilioSmsEventType } from "../../delivery-events";
import type {
  CommsWebhookAdapter,
  CommsWebhookParseInput,
  CommsWebhookParseResult,
} from "../webhooks/types";

function readAuthToken(): string | null {
  const token =
    process.env.TWILIO_WEBHOOK_AUTH_TOKEN?.trim() ?? process.env.TWILIO_AUTH_TOKEN?.trim();
  return token || null;
}

/** Twilio `X-Twilio-Signature` validation (form-encoded POST). */
export function verifyTwilioWebhook(
  webhookUrl: string,
  params: Record<string, string>,
  signature: string,
  authToken: string,
): boolean {
  const sortedKeys = Object.keys(params).sort();
  let data = webhookUrl;
  for (const key of sortedKeys) {
    data += key + params[key];
  }

  const expected = createHmac("sha1", authToken).update(data, "utf8").digest("base64");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

function parseFormBody(rawBody: string): Record<string, string> {
  const params = new URLSearchParams(rawBody);
  const result: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  return result;
}

export function parseTwilioSmsStatus(params: Record<string, string>): CommsWebhookParseResult {
  const messageSid = params.MessageSid;
  const messageStatus = params.MessageStatus;
  if (!messageSid || !messageStatus) {
    return null;
  }

  const eventType = normalizeTwilioSmsEventType(messageStatus);
  if (!eventType) {
    return null;
  }

  return {
    provider: "twilio",
    providerEventId: `${messageSid}:${messageStatus}`,
    providerMessageId: messageSid,
    eventType,
    occurredAt: new Date(),
    rawPayload: params,
  };
}

export function createTwilioWebhookAdapter(): CommsWebhookAdapter {
  return {
    provider: "twilio",
    parse(input: CommsWebhookParseInput): CommsWebhookParseResult {
      const authToken = readAuthToken();
      const webhookUrl = input.webhookUrl;
      const signature = input.headers["x-twilio-signature"] ?? input.headers["X-Twilio-Signature"];
      if (!authToken || !webhookUrl || !signature) {
        return null;
      }

      const params = parseFormBody(input.rawBody);
      if (!verifyTwilioWebhook(webhookUrl, params, signature, authToken)) {
        return null;
      }

      return parseTwilioSmsStatus(params);
    },
  };
}
