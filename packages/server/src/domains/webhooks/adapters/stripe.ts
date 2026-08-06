import { createHmac, timingSafeEqual } from "node:crypto";
import type { InboundWebhookAdapter } from "../ports";

function parseStripeSignature(header: string): { timestamp: string; signatures: string[] } | null {
  const parts = header.split(",");
  let timestamp = "";
  const signatures: string[] = [];
  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key === "t") timestamp = value ?? "";
    if (key === "v1" && value) signatures.push(value);
  }
  if (!timestamp || signatures.length === 0) return null;
  return { timestamp, signatures };
}

export function createStripeWebhookAdapter(secret: string): InboundWebhookAdapter {
  return {
    verify(rawBody, headers) {
      const header = headers["stripe-signature"] ?? headers["Stripe-Signature"];
      if (!header) return false;

      const parsed = parseStripeSignature(header);
      if (!parsed) return false;

      const expected = createHmac("sha256", secret)
        .update(`${parsed.timestamp}.${rawBody}`)
        .digest("hex");

      return parsed.signatures.some((sig) => {
        try {
          return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
        } catch {
          return false;
        }
      });
    },
    normalize(rawBody) {
      const event = JSON.parse(rawBody) as {
        id?: string;
        type?: string;
        data?: { object?: Record<string, unknown> };
      };

      const externalEventId = event.id ?? "";
      const eventType = event.type ?? "unknown";
      if (!externalEventId) {
        throw new Error("Stripe event missing id");
      }

      const object = event.data?.object ?? {};
      const metadata = (object.metadata ?? {}) as Record<string, unknown>;

      return {
        externalEventId,
        eventType,
        orgId: typeof metadata.org_id === "string" ? metadata.org_id : undefined,
        connectionId:
          typeof metadata.connection_id === "string" ? metadata.connection_id : undefined,
        payload: event as unknown as Record<string, unknown>,
      };
    },
  };
}
