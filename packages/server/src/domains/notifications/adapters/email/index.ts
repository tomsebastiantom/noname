import { ServiceUnavailableError } from "../../../../shared/domain-error";
import type { CommsProviderName } from "../../../secrets/ports";
import type { EmailSenderPort } from "../../ports";
import { createBrevoEmailSender } from "./brevo";
import { createMailgunEmailSender } from "./mailgun";
import { createPostmarkEmailSender } from "./postmark";
import { createResendEmailSender } from "./resend";
import { createSendGridEmailSender } from "./sendgrid";
import { createSesEmailSender } from "./ses";

const senders: Partial<Record<CommsProviderName, EmailSenderPort>> = {};

export function getEmailSender(provider: CommsProviderName): EmailSenderPort {
  const cached = senders[provider];
  if (cached) return cached;

  let sender: EmailSenderPort;
  switch (provider) {
    case "ses":
      sender = createSesEmailSender();
      break;
    case "resend":
      sender = createResendEmailSender();
      break;
    case "sendgrid":
      sender = createSendGridEmailSender();
      break;
    case "mailgun":
      sender = createMailgunEmailSender();
      break;
    case "postmark":
      sender = createPostmarkEmailSender();
      break;
    case "brevo":
      sender = createBrevoEmailSender();
      break;
    default:
      throw new ServiceUnavailableError(`No email sender adapter for provider: ${provider}`);
  }

  senders[provider] = sender;
  return sender;
}
