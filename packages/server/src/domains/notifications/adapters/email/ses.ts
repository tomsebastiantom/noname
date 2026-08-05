import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import type { CommsCredentials } from "../../../secrets/ports";
import type { EmailSenderPort, SendEmailInput } from "../../ports";

export function createSesEmailSender(): EmailSenderPort {
  return {
    async send(credentials: CommsCredentials, input: SendEmailInput & { from?: string }) {
      if (credentials.provider !== "ses") {
        throw new Error(`SES sender cannot send via ${credentials.provider}`);
      }
      if (!credentials.secretKey) {
        throw new Error("SES requires secretKey in Vault comms payload");
      }

      const region = credentials.region ?? process.env.AWS_REGION ?? "us-east-1";
      const from =
        input.from ??
        (credentials.fromName && credentials.fromEmail
          ? `${credentials.fromName} <${credentials.fromEmail}>`
          : credentials.fromEmail);
      if (!from) {
        throw new Error("from address required — set comms fromEmail in integrations");
      }

      const client = new SESClient({
        region,
        credentials: {
          accessKeyId: credentials.apiKey,
          secretAccessKey: credentials.secretKey,
        },
      });

      const result = await client.send(
        new SendEmailCommand({
          Source: from,
          Destination: { ToAddresses: [input.to] },
          Message: {
            Subject: { Data: input.subject, Charset: "UTF-8" },
            Body: {
              Html: { Data: input.html, Charset: "UTF-8" },
              ...(input.text
                ? { Text: { Data: input.text, Charset: "UTF-8" } }
                : {}),
            },
          },
        }),
      );

      return {
        provider: "ses",
        messageId: result.MessageId ?? "",
      };
    },
  };
}
