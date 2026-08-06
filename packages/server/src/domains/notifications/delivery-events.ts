/** Normalized comms delivery event types (provider-agnostic). */

export const COMMS_DELIVERY_EVENT_TYPES = [
  "sent",
  "delivered",
  "opened",
  "clicked",
  "bounced",
  "complained",
  "delivery_delayed",
  "failed",
] as const;

export type CommsDeliveryEventType = (typeof COMMS_DELIVERY_EVENT_TYPES)[number];

const RESEND_TYPE_MAP: Record<string, CommsDeliveryEventType> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.delivery_delayed": "delivery_delayed",
  "email.failed": "failed",
};

export function normalizeResendEventType(providerType: string): CommsDeliveryEventType | null {
  return RESEND_TYPE_MAP[providerType] ?? null;
}

/** SES event publishing (`eventType`) and legacy SNS notifications (`notificationType`). */
const SES_TYPE_MAP: Record<string, CommsDeliveryEventType> = {
  Send: "sent",
  Delivery: "delivered",
  Open: "opened",
  Click: "clicked",
  Bounce: "bounced",
  Complaint: "complained",
  DeliveryDelay: "delivery_delayed",
  Reject: "failed",
};

export function normalizeSesEventType(providerType: string): CommsDeliveryEventType | null {
  return SES_TYPE_MAP[providerType] ?? null;
}

/** Twilio SMS status callback `MessageStatus` values. */
const TWILIO_SMS_TYPE_MAP: Record<string, CommsDeliveryEventType> = {
  accepted: "sent",
  queued: "sent",
  sending: "sent",
  sent: "sent",
  delivered: "delivered",
  failed: "failed",
  undelivered: "failed",
};

export function normalizeTwilioSmsEventType(status: string): CommsDeliveryEventType | null {
  return TWILIO_SMS_TYPE_MAP[status] ?? null;
}

const SENDGRID_TYPE_MAP: Record<string, CommsDeliveryEventType> = {
  processed: "sent",
  delivered: "delivered",
  open: "opened",
  click: "clicked",
  bounce: "bounced",
  dropped: "failed",
  blocked: "failed",
  spamreport: "complained",
};

export function normalizeSendGridEventType(event: string): CommsDeliveryEventType | null {
  return SENDGRID_TYPE_MAP[event] ?? null;
}

const MAILGUN_TYPE_MAP: Record<string, CommsDeliveryEventType> = {
  accepted: "sent",
  delivered: "delivered",
  opened: "opened",
  clicked: "clicked",
  complained: "complained",
  temporary_fail: "delivery_delayed",
  permanent_fail: "failed",
  failed: "failed",
};

export function normalizeMailgunEventType(event: string): CommsDeliveryEventType | null {
  return MAILGUN_TYPE_MAP[event] ?? null;
}

const POSTMARK_TYPE_MAP: Record<string, CommsDeliveryEventType> = {
  Delivery: "delivered",
  Open: "opened",
  Click: "clicked",
  Bounce: "bounced",
  SpamComplaint: "complained",
};

export function normalizePostmarkEventType(recordType: string): CommsDeliveryEventType | null {
  return POSTMARK_TYPE_MAP[recordType] ?? null;
}

const BREVO_TYPE_MAP: Record<string, CommsDeliveryEventType> = {
  request: "sent",
  delivered: "delivered",
  uniqueOpened: "opened",
  opened: "opened",
  proxy_open: "opened",
  click: "clicked",
  hardBounce: "bounced",
  softBounce: "bounced",
  hard_bounce: "bounced",
  soft_bounce: "bounced",
  deferred: "delivery_delayed",
  spam: "complained",
  blocked: "failed",
  invalid_email: "failed",
  error: "failed",
};

export function normalizeBrevoEventType(event: string): CommsDeliveryEventType | null {
  return BREVO_TYPE_MAP[event] ?? null;
}

export function isCommsDeliveryEventType(value: string): value is CommsDeliveryEventType {
  return (COMMS_DELIVERY_EVENT_TYPES as readonly string[]).includes(value);
}
