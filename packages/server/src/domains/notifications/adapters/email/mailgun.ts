import { ServiceUnavailableError, ValidationError } from "../../../../shared/domain-error";
import type { CommsCredentials } from "../../../secrets/ports";
import type { EmailSenderPort, SendEmailInput } from "../../ports";

export function createMailgunEmailSender(): EmailSenderPort {
  return {
    async send(credentials: CommsCredentials, input: SendEmailInput & { from?: string }) {
      if (credentials.provider !== "mailgun") {
        throw new ServiceUnavailableError(`Mailgun sender cannot send via ${credentials.provider}`);
      }
      if (!credentials.domain) {
        throw new ValidationError(
          "domain",
          "Mailgun requires sending domain — set it in Integrations → Email",
        );
      }

      const from =
        input.from ??
        (credentials.fromName && credentials.fromEmail
          ? `${credentials.fromName} <${credentials.fromEmail}>`
          : credentials.fromEmail);
      if (!from) {
        throw new ValidationError("from", "address required — set comms fromEmail in integrations");
      }

      const body = new URLSearchParams({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
      });
      if (input.text) {
        body.set("text", input.text);
      }

      const auth = Buffer.from(`api:${credentials.apiKey}`, "utf8").toString("base64");
      const baseUrl = process.env.MAILGUN_API_BASE_URL?.trim() || "https://api.mailgun.net";
      const response = await fetch(
        `${baseUrl}/v3/${encodeURIComponent(credentials.domain)}/messages`,
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
        throw new ServiceUnavailableError(`Mailgun send failed (${response.status}): ${detail}`);
      }

      const payload = (await response.json()) as { id?: string };
      const messageId = payload.id?.replace(/^<|>$/g, "") ?? "";
      return { provider: "mailgun", messageId };
    },
  };
}
