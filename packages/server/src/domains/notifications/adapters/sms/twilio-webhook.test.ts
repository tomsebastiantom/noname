import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createTwilioWebhookAdapter,
  parseTwilioSmsStatus,
  verifyTwilioWebhook,
} from "./twilio-webhook";

const AUTH_TOKEN = "test-auth-token";
const WEBHOOK_URL = "https://store.example.com/api/notifications/webhooks/twilio";

function signTwilio(url: string, params: Record<string, string>, authToken: string): string {
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) {
    data += key + params[key];
  }
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

describe("twilio-webhook", () => {
  it("verifies Twilio signature", () => {
    const params = {
      MessageSid: "SM123",
      MessageStatus: "delivered",
      AccountSid: "AC123",
    };
    const signature = signTwilio(WEBHOOK_URL, params, AUTH_TOKEN);
    expect(verifyTwilioWebhook(WEBHOOK_URL, params, signature, AUTH_TOKEN)).toBe(true);
    expect(verifyTwilioWebhook(WEBHOOK_URL, params, "bad", AUTH_TOKEN)).toBe(false);
  });

  it("parses delivered status", () => {
    const parsed = parseTwilioSmsStatus({
      MessageSid: "SM123",
      MessageStatus: "delivered",
    });
    expect(parsed).toEqual({
      provider: "twilio",
      providerEventId: "SM123:delivered",
      providerMessageId: "SM123",
      eventType: "delivered",
      occurredAt: expect.any(Date),
      rawPayload: {
        MessageSid: "SM123",
        MessageStatus: "delivered",
      },
    });
  });

  it("adapter rejects invalid signature", () => {
    vi.stubEnv("TWILIO_AUTH_TOKEN", AUTH_TOKEN);
    const adapter = createTwilioWebhookAdapter();
    const rawBody = "MessageSid=SM123&MessageStatus=sent";
    const result = adapter.parse({
      rawBody,
      headers: { "X-Twilio-Signature": "invalid" },
      webhookUrl: WEBHOOK_URL,
    });
    expect(result).toBeNull();
    vi.unstubAllEnvs();
  });

  it("adapter parses valid status callback", () => {
    vi.stubEnv("TWILIO_AUTH_TOKEN", AUTH_TOKEN);
    const params = {
      MessageSid: "SM456",
      MessageStatus: "failed",
      ErrorCode: "30003",
    };
    const rawBody = new URLSearchParams(params).toString();
    const signature = signTwilio(WEBHOOK_URL, params, AUTH_TOKEN);
    const adapter = createTwilioWebhookAdapter();
    const result = adapter.parse({
      rawBody,
      headers: { "X-Twilio-Signature": signature },
      webhookUrl: WEBHOOK_URL,
    });
    expect(result).toMatchObject({
      provider: "twilio",
      providerMessageId: "SM456",
      eventType: "failed",
    });
    vi.unstubAllEnvs();
  });
});
