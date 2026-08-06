import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  parseResendWebhook,
  verifyAndParseResendWebhook,
  verifySvixWebhook,
} from "./resend-webhook";

const SECRET = "whsec_" + Buffer.from("test-secret-key-32bytes-long!!").toString("base64");

function signPayload(payload: string, id: string, timestamp: string): Record<string, string> {
  const signed = `${id}.${timestamp}.${payload}`;
  const raw = SECRET.startsWith("whsec_") ? SECRET.slice("whsec_".length) : SECRET;
  const key = Buffer.from(raw, "base64");
  const sig = createHmac("sha256", key).update(signed).digest("base64");
  return {
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": `v1,${sig}`,
  };
}

describe("resend-webhook", () => {
  it("verifies valid Svix signature", () => {
    const payload = JSON.stringify({
      type: "email.opened",
      created_at: "2026-08-01T12:00:00.000Z",
      data: { email_id: "msg_abc" },
    });
    const ts = String(Math.floor(Date.now() / 1000));
    const headers = signPayload(payload, "evt_1", ts);
    expect(verifySvixWebhook(payload, headers, SECRET)).toBe(true);
  });

  it("parses opened event", () => {
    const payload = JSON.stringify({
      type: "email.clicked",
      created_at: "2026-08-01T12:00:00.000Z",
      data: { email_id: "msg_xyz" },
    });
    const parsed = parseResendWebhook(payload, { "svix-id": "evt_2" });
    expect(parsed).toEqual({
      provider: "resend",
      providerEventId: "evt_2",
      providerMessageId: "msg_xyz",
      eventType: "clicked",
      occurredAt: new Date("2026-08-01T12:00:00.000Z"),
      rawPayload: expect.objectContaining({ type: "email.clicked" }),
    });
  });

  it("verifyAndParse rejects bad signature", () => {
    const payload = JSON.stringify({
      type: "email.delivered",
      created_at: "2026-08-01T12:00:00.000Z",
      data: { email_id: "msg_1" },
    });
    const result = verifyAndParseResendWebhook(
      payload,
      { "svix-id": "evt_3", "svix-timestamp": "1", "svix-signature": "v1,bad" },
      SECRET,
    );
    expect(result).toBeNull();
  });
});
