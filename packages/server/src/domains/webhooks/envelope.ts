export function buildOutboundWebhookBody(
  eventType: string,
  eventId: string,
  payload: Record<string, unknown>,
): string {
  return JSON.stringify({
    type: eventType,
    id: eventId,
    created_at: new Date().toISOString(),
    data: payload,
  });
}
