import { ServiceUnavailableError, ValidationError } from "../../../../shared/domain-error";
import type { CommsCredentials } from "../../../secrets/ports";
import type { EmailSenderPort, SendEmailInput } from "../../ports";

export function createBrevoEmailSender(): EmailSenderPort {
  return {
    async send(credentials: CommsCredentials, input: SendEmailInput & { from?: string }) {
      if (credentials.provider !== "brevo") {
        throw new ServiceUnavailableError(`Brevo sender cannot send via ${credentials.provider}`);
      }

      const fromEmail = input.from ?? credentials.fromEmail;
      if (!fromEmail) {
        throw new ValidationError("from", "address required — set comms fromEmail in integrations");
      }

      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": credentials.apiKey,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender: {
            email: fromEmail,
            ...(credentials.fromName ? { name: credentials.fromName } : {}),
          },
          to: [{ email: input.to }],
          subject: input.subject,
          htmlContent: input.html,
          ...(input.text ? { textContent: input.text } : {}),
          ...(input.headers && Object.keys(input.headers).length > 0
            ? { headers: input.headers }
            : {}),
        }),
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new ServiceUnavailableError(`Brevo send failed (${response.status}): ${detail}`);
      }

      const body = (await response.json()) as { messageId?: string };
      return { provider: "brevo", messageId: body.messageId ?? "" };
    },
  };
}
