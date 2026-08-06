/** Canonical comms provider ids (aligned with Novu email + SMS coverage). */

export const COMMS_EMAIL_PROVIDERS = [
  "resend",
  "ses",
  "sendgrid",
  "mailgun",
  "postmark",
  "brevo",
] as const;

export const COMMS_SMS_PROVIDERS = ["twilio"] as const;

export const COMMS_PROVIDERS = [...COMMS_EMAIL_PROVIDERS, ...COMMS_SMS_PROVIDERS] as const;

export type CommsEmailProviderName = (typeof COMMS_EMAIL_PROVIDERS)[number];
export type CommsSmsProviderName = (typeof COMMS_SMS_PROVIDERS)[number];
export type CommsProviderName = (typeof COMMS_PROVIDERS)[number];

export function isCommsProviderName(value: string): value is CommsProviderName {
  return (COMMS_PROVIDERS as readonly string[]).includes(value);
}

export function isCommsEmailProviderName(value: string): value is CommsEmailProviderName {
  return (COMMS_EMAIL_PROVIDERS as readonly string[]).includes(value);
}
