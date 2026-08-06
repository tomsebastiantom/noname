import { describe, expect, it } from "vitest";
import { parseSesEventMessage, parseSesSnsEnvelope } from "./ses-webhook";

describe("ses-webhook", () => {
  it("parses SES event publishing delivery notification", () => {
    const parsed = parseSesEventMessage({
      eventType: "Delivery",
      mail: {
        messageId: "01000184abcd",
        timestamp: "2026-08-01T12:00:00.000Z",
      },
    });

    expect(parsed).toEqual({
      provider: "ses",
      providerEventId: "01000184abcd:Delivery",
      providerMessageId: "01000184abcd",
      eventType: "delivered",
      occurredAt: new Date("2026-08-01T12:00:00.000Z"),
      rawPayload: expect.objectContaining({ eventType: "Delivery" }),
    });
  });

  it("parses legacy bounce notificationType", () => {
    const parsed = parseSesEventMessage({
      notificationType: "Bounce",
      mail: { messageId: "01000184bounce" },
    });

    expect(parsed).toMatchObject({
      provider: "ses",
      providerMessageId: "01000184bounce",
      eventType: "bounced",
    });
  });

  it("detects SNS subscription confirmation", () => {
    const envelope = parseSesSnsEnvelope(
      JSON.stringify({
        Type: "SubscriptionConfirmation",
        SubscribeURL: "https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription",
      }),
    );

    expect(envelope?.inner).toEqual({
      kind: "subscription_confirmation",
      subscribeUrl: "https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription",
    });
  });
});
