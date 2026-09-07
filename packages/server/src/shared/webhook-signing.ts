import { createHmac, timingSafeEqual } from "node:crypto";

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

/** Max age of a signed delivery (replay protection). */
export const WEBHOOK_SIGNATURE_TOLERANCE_SECONDS = 300;

/** Verify a Standard Webhooks signature (what extension backends implement). */
export function verifyOutboundWebhook(
  secret: string,
  webhookId: string,
  timestamp: number,
  body: string,
  signatureHeader: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!signatureHeader || !Number.isFinite(timestamp)) return false;
  if (Math.abs(nowSeconds - timestamp) > WEBHOOK_SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = createHmac("sha256", secret)
    .update(`${webhookId}.${timestamp}.${body}`)
    .digest("base64");
  const actual = signatureHeader.startsWith("v1,") ? signatureHeader.slice(3) : signatureHeader;
  if (actual.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
  } catch {
    return false;
  }
}
