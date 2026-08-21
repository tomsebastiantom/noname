import { ServiceUnavailableError } from "../../../../shared/domain-error";
import type { SmsSenderPort } from "./ports";

export function createTwilioSmsSender(): SmsSenderPort {
  return {
    async send(credentials, input) {
      if (credentials.provider !== "twilio") {
        throw new ServiceUnavailableError(`Twilio sender cannot send via ${credentials.provider}`);
      }

      const accountSid = credentials.apiKey;
      const authToken = credentials.secretKey;
      const from = credentials.fromEmail;
      if (!accountSid || !authToken || !from) {
        throw new ServiceUnavailableError(
          "Twilio requires accountSid (apiKey), authToken (secretKey), and from number",
        );
      }

      const auth = Buffer.from(`${accountSid}:${authToken}`, "utf8").toString("base64");
      const body = new URLSearchParams({
        To: input.to,
        From: from,
        Body: input.body,
      });

      const statusCallback =
        process.env.TWILIO_STATUS_CALLBACK_URL?.trim() ??
        process.env.COMMS_TWILIO_STATUS_CALLBACK_URL?.trim();
      if (statusCallback) {
        body.set("StatusCallback", statusCallback);
      }

      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body,
        },
      );

      if (!response.ok) {
        const detail = await response.text();
        throw new ServiceUnavailableError(`Twilio send failed (${response.status}): ${detail}`);
      }

      const payload = (await response.json()) as { sid?: string };
      return {
        provider: "twilio",
        messageId: payload.sid ?? "",
      };
    },
  };
}
