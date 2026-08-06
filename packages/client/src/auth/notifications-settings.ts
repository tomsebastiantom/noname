import { apiFetch } from "../lib/api";

export type NotificationChannelPrefs = {
  email: boolean;
  sms: boolean;
  in_app: boolean;
};

export type NotificationCategoryPrefs = {
  marketing: boolean;
  operational: boolean;
};

export type NotificationTriggerPref = {
  enabled: boolean;
};

export type NotificationPreferences = {
  channels: NotificationChannelPrefs;
  categories: NotificationCategoryPrefs;
  triggers?: Record<string, NotificationTriggerPref>;
};

export async function loadNotificationPreferences(): Promise<NotificationPreferences> {
  const body = await apiFetch<{ data?: NotificationPreferences }>("/api/notifications/preferences");
  if (!body.data) {
    throw new Error("Missing notification preferences");
  }
  return body.data;
}

export async function saveNotificationPreferences(
  patch: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  const body = await apiFetch<{ data?: NotificationPreferences }>(
    "/api/notifications/preferences",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    },
  );
  if (!body.data) {
    throw new Error("Save preferences failed");
  }
  return body.data;
}

export interface CommsDeliveryEventRow {
  id: string;
  deliveryId: string;
  eventType: string;
  occurredAt: string;
}

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
  events?: CommsDeliveryEventRow[];
}

export async function loadCommsDeliveries(query?: {
  status?: string;
  limit?: number;
  includeEvents?: boolean;
}): Promise<CommsDeliveryRow[]> {
  const params = new URLSearchParams();
  if (query?.status) params.set("status", query.status);
  if (query?.limit) params.set("limit", String(query.limit));
  if (query?.includeEvents) params.set("includeEvents", "true");

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

export interface CommsInboxItem {
  id: string;
  orgId: string;
  userId: string;
  title: string;
  body: string;
  trigger: string | null;
  metadata: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export async function loadCommsInbox(query?: {
  unreadOnly?: boolean;
  limit?: number;
}): Promise<CommsInboxItem[]> {
  const params = new URLSearchParams();
  if (query?.unreadOnly) params.set("unreadOnly", "true");
  if (query?.limit) params.set("limit", String(query.limit));

  const qs = params.toString();
  const body = await apiFetch<{ data?: CommsInboxItem[] }>(
    `/api/notifications/inbox${qs ? `?${qs}` : ""}`,
  );
  return body.data ?? [];
}

export async function markCommsInboxRead(itemId: string): Promise<CommsInboxItem> {
  const body = await apiFetch<{ data?: CommsInboxItem }>(
    `/api/notifications/inbox/${encodeURIComponent(itemId)}/read`,
    { method: "POST" },
  );
  if (!body.data) {
    throw new Error("Mark read failed");
  }
  return body.data;
}
