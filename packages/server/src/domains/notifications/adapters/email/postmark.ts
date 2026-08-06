import type { CommsCredentials } from "../../../secrets/ports";
import type { EmailSenderPort, SendEmailInput } from "../../ports";

export function createPostmarkEmailSender(): EmailSenderPort {
  return {
    async send(credentials: CommsCredentials, input: SendEmailInput & { from?: string }) {
      if (credentials.provider !== "postmark") {
        throw new Error(`Postmark sender cannot send via ${credentials.provider}`);
      }

      const from = input.from ?? credentials.fromEmail;
      if (!from) {
        throw new Error("from address required — set comms fromEmail in integrations");
      }

      const response = await fetch("https://api.postmarkapp.com/email", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Postmark-Server-Token": credentials.apiKey,
        },
        body: JSON.stringify({
          From: from,
          To: input.to,
          Subject: input.subject,
          HtmlBody: input.html,
          ...(input.text ? { TextBody: input.text } : {}),
          ...(input.headers && Object.keys(input.headers).length > 0
            ? {
                Headers: Object.entries(input.headers).map(([Name, Value]) => ({ Name, Value })),
              }
            : {}),
        }),
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Postmark send failed (${response.status}): ${detail}`);
      }

      const body = (await response.json()) as { MessageID?: string };
      return { provider: "postmark", messageId: body.MessageID ?? "" };
    },
  };
}
