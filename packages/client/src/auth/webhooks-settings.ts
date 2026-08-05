import { apiFetch } from "../lib/api";

export interface WebhookSubscriptionRow {
  id: string;
  orgId: string;
  url: string;
  eventTypes: string[];
  enabled: boolean;
  description: string | null;
  consecutiveFailures: number;
  hasSigningSecret: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookOutboundDeliveryRow {
  id: string;
  orgId: string;
  subscriptionId: string;
  eventType: string;
  eventId: string;
  status: string;
  attemptCount: number;
  lastStatusCode: number | null;
  error: string | null;
  createdAt: string;
  deliveredAt: string | null;
}

export async function loadWebhookSubscriptions(): Promise<WebhookSubscriptionRow[]> {
  const body = await apiFetch<{ data?: WebhookSubscriptionRow[] }>("/api/webhooks/subscriptions");
  return body.data ?? [];
}

export async function createWebhookSubscription(input: {
  url: string;
  eventTypes: string[];
  enabled?: boolean;
  description?: string;
  signingSecret?: string;
}): Promise<WebhookSubscriptionRow> {
  const body = await apiFetch<{ data?: WebhookSubscriptionRow }>("/api/webhooks/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!body.data?.id) {
    throw new Error("Failed to create webhook subscription");
  }
  return body.data;
}

export async function updateWebhookSubscription(
  subscriptionId: string,
  input: {
    url: string;
    eventTypes: string[];
    enabled?: boolean;
    description?: string;
    signingSecret?: string;
  },
): Promise<WebhookSubscriptionRow> {
  const body = await apiFetch<{ data?: WebhookSubscriptionRow }>(
    `/api/webhooks/subscriptions/${encodeURIComponent(subscriptionId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (!body.data?.id) {
    throw new Error("Failed to update webhook subscription");
  }
  return body.data;
}

export async function deleteWebhookSubscription(subscriptionId: string): Promise<void> {
  await apiFetch(`/api/webhooks/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "DELETE",
  });
}

export async function loadWebhookOutboundDeliveries(limit = 50): Promise<WebhookOutboundDeliveryRow[]> {
  const body = await apiFetch<{ data?: WebhookOutboundDeliveryRow[] }>(
    `/api/webhooks/outbound/deliveries?limit=${limit}`,
  );
  return body.data ?? [];
}

export async function retryWebhookOutboundDelivery(
  deliveryId: string,
): Promise<{ deliveryId: string; jobId: string }> {
  const body = await apiFetch<{ data?: { deliveryId: string; jobId: string } }>(
    `/api/webhooks/outbound/deliveries/${encodeURIComponent(deliveryId)}/retry`,
    { method: "POST" },
  );
  if (!body.data?.deliveryId) {
    throw new Error("Retry failed");
  }
  return body.data;
}
