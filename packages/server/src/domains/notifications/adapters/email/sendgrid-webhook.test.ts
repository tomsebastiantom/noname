import { describe, expect, it } from "vitest";
import { parseSendGridWebhookEvent } from "./sendgrid-webhook";

describe("sendgrid-webhook", () => {
  it("parses delivered event", () => {
    const parsed = parseSendGridWebhookEvent({
      event: "delivered",
      sg_message_id: "abc.filter0001.123",
      sg_event_id: "evt_sg_1",
      timestamp: 1_512_345_678,
    });
    expect(parsed).toMatchObject({
      provider: "sendgrid",
      providerMessageId: "abc",
      eventType: "delivered",
      providerEventId: "evt_sg_1",
    });
  });
});
