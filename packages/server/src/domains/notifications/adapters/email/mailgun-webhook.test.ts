import { describe, expect, it } from "vitest";
import { parseMailgunWebhook } from "./mailgun-webhook";

describe("mailgun-webhook", () => {
  it("parses opened event", () => {
    const parsed = parseMailgunWebhook({
      signature: { timestamp: "1", token: "t", signature: "s" },
      "event-data": {
        event: "opened",
        id: "evt_mg_1",
        timestamp: 1_512_345_678,
        message: { headers: { "message-id": "<msg-123@mailgun>" } },
      },
    });
    expect(parsed).toMatchObject({
      provider: "mailgun",
      providerMessageId: "msg-123@mailgun",
      eventType: "opened",
    });
  });
});
