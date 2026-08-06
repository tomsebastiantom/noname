import { createBrevoWebhookAdapter } from "../email/brevo-webhook";
import { createMailgunWebhookAdapter } from "../email/mailgun-webhook";
import { createPostmarkWebhookAdapter } from "../email/postmark-webhook";
import { createResendWebhookAdapter } from "../email/resend-webhook";
import { createSendGridWebhookAdapter } from "../email/sendgrid-webhook";
import { createSesWebhookAdapter } from "../email/ses-webhook";
import { createTwilioWebhookAdapter } from "../sms/twilio-webhook";
import type { CommsWebhookAdapter } from "./types";

const ADAPTERS: CommsWebhookAdapter[] = [
  createResendWebhookAdapter(),
  createSesWebhookAdapter(),
  createSendGridWebhookAdapter(),
  createMailgunWebhookAdapter(),
  createPostmarkWebhookAdapter(),
  createBrevoWebhookAdapter(),
  createTwilioWebhookAdapter(),
];

const BY_PROVIDER = new Map(ADAPTERS.map((adapter) => [adapter.provider, adapter]));

export function getCommsWebhookAdapter(provider: string): CommsWebhookAdapter | null {
  return BY_PROVIDER.get(provider) ?? null;
}

export function listCommsWebhookProviders(): string[] {
  return [...BY_PROVIDER.keys()];
}
