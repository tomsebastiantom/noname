import type { NotificationsStorage } from "../postgres";
import type { NormalizedCommsWebhookEvent } from "./types";

export async function applyCommsWebhookEvent(
  storage: NotificationsStorage,
  normalized: NormalizedCommsWebhookEvent,
): Promise<{ received: true; matched: boolean; duplicate?: boolean }> {
  const delivery = await storage.findDeliveryByProviderMessageId(
    normalized.provider,
    normalized.providerMessageId,
  );
  if (!delivery) {
    return { received: true, matched: false };
  }

  const { duplicate } = await storage.insertDeliveryEvent({
    id: crypto.randomUUID(),
    orgId: delivery.orgId,
    deliveryId: delivery.id,
    eventType: normalized.eventType,
    occurredAt: normalized.occurredAt,
    providerEventId: normalized.providerEventId,
    rawPayload: normalized.rawPayload,
  });

  if (normalized.eventType === "bounced" || normalized.eventType === "failed") {
    await storage.updateDelivery(delivery.id, { status: "failed" });
  } else if (normalized.eventType === "delivered" && delivery.status === "sent") {
    await storage.updateDelivery(delivery.id, { status: "delivered" });
  }

  return { received: true, matched: true, duplicate };
}
