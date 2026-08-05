export interface NormalizedInboundWebhook {
  externalEventId: string;
  eventType: string;
  orgId?: string;
  connectionId?: string;
  payload: Record<string, unknown>;
}

export interface InboundWebhookAdapter {
  verify(rawBody: string, headers: Record<string, string | undefined>): boolean;
  normalize(rawBody: string): NormalizedInboundWebhook;
}

export interface WebhookReceiptDTO {
  id: string;
  orgId: string | null;
  provider: string;
  externalEventId: string;
  eventType: string;
  status: string;
  error: string | null;
  createdAt: Date;
  processedAt: Date | null;
}

export interface WebhookSubscriptionDTO {
  id: string;
  orgId: string;
  url: string;
  eventTypes: string[];
  enabled: boolean;
  description: string | null;
  consecutiveFailures: number;
  hasSigningSecret: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertWebhookSubscriptionInput {
  url: string;
  eventTypes: string[];
  enabled?: boolean;
  description?: string;
  signingSecret?: string;
}

export interface WebhookOutboundDeliveryDTO {
  id: string;
  orgId: string;
  subscriptionId: string;
  eventType: string;
  eventId: string;
  status: string;
  attemptCount: number;
  lastStatusCode: number | null;
  error: string | null;
  createdAt: Date;
  deliveredAt: Date | null;
}

export interface WebhooksService {
  handleInbound(
    provider: string,
    rawBody: string,
    headers: Record<string, string | undefined>,
  ): Promise<{ receiptId: string; duplicate: boolean }>;
  listSubscriptions(orgId: string): Promise<WebhookSubscriptionDTO[]>;
  upsertSubscription(
    orgId: string,
    subscriptionId: string | null,
    input: UpsertWebhookSubscriptionInput,
    actorId: string,
  ): Promise<WebhookSubscriptionDTO>;
  deleteSubscription(orgId: string, subscriptionId: string): Promise<void>;
  deliverOutbound(
    orgId: string,
    eventType: string,
    payload: Record<string, unknown>,
    eventId?: string,
  ): Promise<{ deliveryIds: string[] }>;
  listOutboundDeliveries(orgId: string, limit?: number): Promise<WebhookOutboundDeliveryDTO[]>;
  retryOutboundDelivery(
    orgId: string,
    deliveryId: string,
  ): Promise<{ deliveryId: string; jobId: string }>;
}

export interface WebhookInboundJobData {
  receiptId: string;
  orgId: string | null;
  provider: string;
  eventType: string;
  payload: Record<string, unknown>;
}

export interface WebhookOutboundJobData {
  deliveryId: string;
  orgId: string;
  subscriptionId: string;
  url: string;
  eventType: string;
  eventId: string;
  body: string;
}

export interface WebhookReceivedPayload {
  receiptId: string;
  orgId: string | null;
  provider: string;
  eventType: string;
  payload: Record<string, unknown>;
}
