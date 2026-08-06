import { describe, expect, it } from "vitest";
import { normalizeBrevoEventType } from "../../delivery-events";
import { parseBrevoWebhook } from "./brevo-webhook";

describe("brevo-webhook", () => {
  it("maps official snake_case bounce events", () => {
    expect(normalizeBrevoEventType("soft_bounce")).toBe("bounced");
    expect(normalizeBrevoEventType("hard_bounce")).toBe("bounced");
    expect(normalizeBrevoEventType("deferred")).toBe("delivery_delayed");
    expect(normalizeBrevoEventType("spam")).toBe("complained");
  });

  it("parses delivered payload per Brevo docs", () => {
    const parsed = parseBrevoWebhook({
      event: "delivered",
      "message-id": "201798300811.5787683@relay.domain.com",
      ts_event: 1_604_933_654,
      date: "2020-11-09 18:54:14",
    });
    expect(parsed).toMatchObject({
      provider: "brevo",
      providerMessageId: "201798300811.5787683@relay.domain.com",
      eventType: "delivered",
      providerEventId: "201798300811.5787683@relay.domain.com:delivered:1604933654",
    });
  });
});
