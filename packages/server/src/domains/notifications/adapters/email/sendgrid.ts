import { ServiceUnavailableError, ValidationError } from "../../../../shared/domain-error";
import type { CommsCredentials } from "../../../secrets/ports";
import type { EmailSenderPort, SendEmailInput } from "../../ports";

export function createSendGridEmailSender(): EmailSenderPort {
  return {
    async send(credentials: CommsCredentials, input: SendEmailInput & { from?: string }) {
      if (credentials.provider !== "sendgrid") {
        throw new ServiceUnavailableError(
          `SendGrid sender cannot send via ${credentials.provider}`,
        );
      }

      if (!credentials.fromEmail) {
        throw new ValidationError("from", "address required — set comms fromEmail in integrations");
      }

      const from = input.from ?? credentials.fromEmail;
      const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: input.to }] }],
          from: {
            email: from,
            ...(credentials.fromName ? { name: credentials.fromName } : {}),
          },
          subject: input.subject,
          content: [
            { type: "text/html", value: input.html },
            ...(input.text ? [{ type: "text/plain", value: input.text }] : []),
          ],
          ...(input.headers && Object.keys(input.headers).length > 0
            ? { headers: input.headers }
            : {}),
        }),
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new ServiceUnavailableError(`SendGrid send failed (${response.status}): ${detail}`);
      }

      return {
        provider: "sendgrid",
        messageId: response.headers.get("x-message-id") ?? "",
      };
    },
  };
}
