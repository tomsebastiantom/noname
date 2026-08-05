import { createHmac } from "node:crypto";

/** Standard Webhooks–compatible signing (v1, base64 HMAC-SHA256). */
export function signOutboundWebhook(
  secret: string,
  webhookId: string,
  timestamp: number,
  body: string,
): Record<string, string> {
  const signedContent = `${webhookId}.${timestamp}.${body}`;
  const signature = createHmac("sha256", secret).update(signedContent).digest("base64");
  return {
    "content-type": "application/json",
    "webhook-id": webhookId,
    "webhook-timestamp": String(timestamp),
    "webhook-signature": `v1,${signature}`,
  };
}
