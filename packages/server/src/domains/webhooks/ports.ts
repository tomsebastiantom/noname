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

export interface WebhooksService {
  handleInbound(
    provider: string,
    rawBody: string,
    headers: Record<string, string | undefined>,
  ): Promise<{ receiptId: string; duplicate: boolean }>;
}

export interface WebhookInboundJobData {
  receiptId: string;
  orgId: string | null;
  provider: string;
  eventType: string;
  payload: Record<string, unknown>;
}
