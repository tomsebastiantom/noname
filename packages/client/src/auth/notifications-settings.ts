import { apiFetch } from "../lib/api";

export interface CommsDeliveryRow {
  id: string;
  orgId: string;
  userId: string | null;
  channel: string;
  provider: string;
  toAddress: string;
  subject: string | null;
  status: string;
  providerMessageId: string | null;
  error: string | null;
  trigger: string | null;
  templateId: string | null;
  idempotencyKey: string | null;
  attemptCount: number;
  createdAt: string;
  sentAt: string | null;
}

export async function loadCommsDeliveries(query?: {
  status?: string;
  limit?: number;
}): Promise<CommsDeliveryRow[]> {
  const params = new URLSearchParams();
  if (query?.status) params.set("status", query.status);
  if (query?.limit) params.set("limit", String(query.limit));

  const qs = params.toString();
  const body = await apiFetch<{ data?: CommsDeliveryRow[] }>(
    `/api/notifications/deliveries${qs ? `?${qs}` : ""}`,
  );
  return body.data ?? [];
}

export async function retryCommsDelivery(
  deliveryId: string,
): Promise<{ deliveryId: string; jobId: string }> {
  const body = await apiFetch<{ data?: { deliveryId: string; jobId: string } }>(
    `/api/notifications/deliveries/${encodeURIComponent(deliveryId)}/retry`,
    { method: "POST" },
  );
  if (!body.data?.deliveryId) {
    throw new Error("Retry failed");
  }
  return body.data;
}
