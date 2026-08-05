import type { CommsCredentials } from "../../../secrets/ports";
import type { EmailSenderPort, SendEmailInput } from "../../ports";

export function createResendEmailSender(): EmailSenderPort {
  return {
    async send(credentials: CommsCredentials, input: SendEmailInput & { from?: string }) {
      if (credentials.provider !== "resend") {
        throw new Error(`Resend sender cannot send via ${credentials.provider}`);
      }

      const from =
        input.from ??
        (credentials.fromName && credentials.fromEmail
          ? `${credentials.fromName} <${credentials.fromEmail}>`
          : credentials.fromEmail);
      if (!from) {
        throw new Error("from address required — set comms fromEmail in integrations");
      }

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [input.to],
          subject: input.subject,
          html: input.html,
          text: input.text,
        }),
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Resend send failed (${response.status}): ${detail}`);
      }

      const body = (await response.json()) as { id?: string };
      return {
        provider: "resend",
        messageId: body.id ?? "",
      };
    },
  };
}
