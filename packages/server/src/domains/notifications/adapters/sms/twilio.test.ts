import { describe, expect, it, vi } from "vitest";
import { createTwilioSmsSender } from "./twilio";

describe("createTwilioSmsSender", () => {
  it("posts to Twilio Messages API", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ sid: "SM123" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const sender = createTwilioSmsSender();
    const result = await sender.send(
      {
        provider: "twilio",
        apiKey: "AC123",
        secretKey: "auth-token",
        fromEmail: "+15551234567",
      },
      { to: "+15559876543", body: "Hello" },
    );

    expect(result).toEqual({ provider: "twilio", messageId: "SM123" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json",
      expect.objectContaining({ method: "POST" }),
    );

    vi.unstubAllGlobals();
  });
});
