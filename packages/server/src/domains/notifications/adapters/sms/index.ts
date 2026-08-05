import type { CommsProviderName } from "../../../secrets/ports";
import type { SmsSenderPort } from "./ports";
import { createTwilioSmsSender } from "./twilio";

const senders: Partial<Record<CommsProviderName, SmsSenderPort>> = {};

export function getSmsSender(provider: CommsProviderName): SmsSenderPort {
  const cached = senders[provider];
  if (cached) return cached;

  let sender: SmsSenderPort;
  switch (provider) {
    case "twilio":
      sender = createTwilioSmsSender();
      break;
    default:
      throw new Error(`No SMS sender adapter for provider: ${provider}`);
  }

  senders[provider] = sender;
  return sender;
}
