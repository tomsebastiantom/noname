import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeResendEventType } from "../../delivery-events";
import type {
  CommsWebhookAdapter,
  CommsWebhookParseInput,
  CommsWebhookParseResult,
  NormalizedCommsWebhookEvent,
} from "../webhooks/types";

export interface ResendWebhookHeaders {
  "svix-id"?: string;
  "svix-timestamp"?: string;
  "svix-signature"?: string;
}

export type { NormalizedCommsWebhookEvent as NormalizedResendWebhookEvent };

function decodeSvixSecret(secret: string): Buffer {
  const trimmed = secret.trim();
  const raw = trimmed.startsWith("whsec_") ? trimmed.slice("whsec_".length) : trimmed;
  return Buffer.from(raw, "base64");
}

/** Svix / Standard Webhooks verification (Resend uses Svix). */
export function verifySvixWebhook(
  payload: string,
  headers: ResendWebhookHeaders,
  secret: string,
  maxAgeSeconds = 300,
): boolean {
  const id = headers["svix-id"];
  const timestamp = headers["svix-timestamp"];
  const signatureHeader = headers["svix-signature"];
  if (!id || !timestamp || !signatureHeader) {
    return false;
  }

  const ts = Number.parseInt(timestamp, 10);
  if (Number.isNaN(ts)) {
    return false;
  }
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > maxAgeSeconds) {
    return false;
  }

  const signed = `${id}.${timestamp}.${payload}`;
  const key = decodeSvixSecret(secret);
  const expected = createHmac("sha256", key).update(signed).digest("base64");

  for (const part of signatureHeader.split(" ")) {
    const comma = part.indexOf(",");
    if (comma <= 0) continue;
    const version = part.slice(0, comma);
    const sig = part.slice(comma + 1);
    if (version !== "v1" || !sig) continue;
    try {
      if (timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
        return true;
      }
    } catch {
      // length mismatch — try next signature
    }
  }
  return false;
}

export function parseResendWebhook(
  rawBody: string,
  headers: ResendWebhookHeaders,
): NormalizedCommsWebhookEvent | null {
  const providerEventId = headers["svix-id"];
  if (!providerEventId) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody) as unknown;
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const body = parsed as { type?: string; created_at?: string; data?: { email_id?: string } };
  const providerType = body.type ?? "";
  const eventType = normalizeResendEventType(providerType);
  const providerMessageId = body.data?.email_id;
  if (!eventType || !providerMessageId) {
    return null;
  }

  const occurredAt = body.created_at ? new Date(body.created_at) : new Date();
  if (Number.isNaN(occurredAt.getTime())) {
    return null;
  }

  return {
    provider: "resend",
    providerEventId,
    providerMessageId,
    eventType,
    occurredAt,
    rawPayload: parsed as Record<string, unknown>,
  };
}

function readResendWebhookSecret(): string | null {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  return secret || null;
}

export function createResendWebhookAdapter(): CommsWebhookAdapter {
  return {
    provider: "resend",
    parse(input: CommsWebhookParseInput): CommsWebhookParseResult {
      const secret = readResendWebhookSecret();
      if (!secret) {
        return null;
      }

      const headers = input.headers as ResendWebhookHeaders;
      if (!verifySvixWebhook(input.rawBody, headers, secret)) {
        return null;
      }

      return parseResendWebhook(input.rawBody, headers);
    },
  };
}

export function verifyAndParseResendWebhook(
  rawBody: string,
  headers: ResendWebhookHeaders,
  webhookSecret: string,
): NormalizedCommsWebhookEvent | null {
  if (!verifySvixWebhook(rawBody, headers, webhookSecret)) {
    return null;
  }
  return parseResendWebhook(rawBody, headers);
}
