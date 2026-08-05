import type { CommsProviderName } from "../../../secrets/ports";
import type { EmailSenderPort } from "../../ports";
import { createResendEmailSender } from "./resend";
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
    default:
      throw new Error(`No email sender adapter for provider: ${provider}`);
  }

  senders[provider] = sender;
  return sender;
}
