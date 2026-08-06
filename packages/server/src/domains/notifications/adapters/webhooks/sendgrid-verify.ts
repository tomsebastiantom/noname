import { createPublicKey, verify } from "node:crypto";

/** SendGrid signed event webhook (ECDSA P-256, ASN.1 DER signature). */
export function verifySendGridEventWebhook(
  publicKeyPem: string,
  rawBody: string,
  signature: string,
  timestamp: string,
): boolean {
  try {
    const payload = Buffer.concat([Buffer.from(timestamp, "utf8"), Buffer.from(rawBody, "utf8")]);
    const key = createPublicKey(publicKeyPem);
    return verify("sha256", payload, { key, dsaEncoding: "der" }, Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}
