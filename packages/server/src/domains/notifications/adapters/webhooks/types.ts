import type { CommsDeliveryEventType } from "../../delivery-events";

export interface NormalizedCommsWebhookEvent {
  provider: string;
  providerEventId: string;
  providerMessageId: string;
  eventType: CommsDeliveryEventType;
  occurredAt: Date;
  rawPayload: Record<string, unknown>;
}

export interface CommsWebhookParseInput {
  rawBody: string;
  headers: Record<string, string | undefined>;
  query?: Record<string, string | undefined>;
  /** Full public URL Twilio POSTed to (includes query string when present). */
  webhookUrl?: string;
}

export type CommsWebhookParseResult =
  | NormalizedCommsWebhookEvent
  | { kind: "subscription_confirmation"; subscribeUrl: string }
  | null;

export function isCommsDeliveryWebhookEvent(
  result: CommsWebhookParseResult,
): result is NormalizedCommsWebhookEvent {
  return result !== null && !("kind" in result);
}

export interface CommsWebhookAdapter {
  readonly provider: string;
  parse(input: CommsWebhookParseInput): CommsWebhookParseResult | Promise<CommsWebhookParseResult>;
}
