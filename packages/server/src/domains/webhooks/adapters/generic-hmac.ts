import { createHmac, timingSafeEqual } from "node:crypto";
import { ValidationError } from "../../../shared/domain-error";
import type { InboundWebhookAdapter } from "../ports";

export function createGenericHmacAdapter(secret: string): InboundWebhookAdapter {
  return {
    verify(rawBody, headers) {
      const signature = headers["x-webhook-signature"] ?? headers["X-Webhook-Signature"];
      if (!signature?.startsWith("sha256=")) return false;
      const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
      const provided = signature.slice("sha256=".length);
      try {
        return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
      } catch {
        return false;
      }
    },
    normalize(rawBody) {
      const parsed = JSON.parse(rawBody) as Record<string, unknown>;
      const eventId = String(parsed.eventId ?? parsed.id ?? "");
      const eventType = String(parsed.eventType ?? parsed.type ?? "unknown");
      if (!eventId) {
        throw new ValidationError("eventId", "Generic webhook payload requires eventId or id");
      }
      return {
        externalEventId: eventId,
        eventType,
        orgId: typeof parsed.orgId === "string" ? parsed.orgId : undefined,
        connectionId: typeof parsed.connectionId === "string" ? parsed.connectionId : undefined,
        payload: parsed,
      };
    },
  };
}
