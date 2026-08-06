import { createVerify, X509Certificate } from "node:crypto";

const SNS_CERT_HOST =
  /^sns\.([a-z]{2}(?:-gov)?-(?:central|north|south|east|west|northeast|northwest|southeast|southwest)-[1-9]|cn-(?:north|northwest)-1)\.amazonaws\.com(?:\.cn)?$/;

const SNS_CERT_PATH = /^\/SimpleNotificationService(-[A-Za-z0-9]+)?\.pem$/;

function isValidSigningCertUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (!SNS_CERT_HOST.test(parsed.hostname) && parsed.hostname !== "sns.amazonaws.com") {
      return false;
    }
    return SNS_CERT_PATH.test(parsed.pathname);
  } catch {
    return false;
  }
}

function buildStringToSign(message: Record<string, unknown>): string {
  const fields =
    message.Type === "Notification"
      ? ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"]
      : ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"];

  let result = "";
  for (const field of fields) {
    if (field in message && message[field] !== undefined && message[field] !== null) {
      result += `${field}\n${String(message[field])}\n`;
    }
  }
  return result;
}

function extractRegionFromTopicArn(topicArn: string): string | null {
  const parts = topicArn.split(":");
  if (parts.length >= 4 && parts[0] === "arn" && parts[1] === "aws" && parts[2] === "sns") {
    return parts[3] ?? null;
  }
  return null;
}

/** Validates AWS SNS message signatures (SignatureVersion 1, RSA-SHA1). */
export async function verifySnsMessage(
  message: Record<string, unknown>,
  options?: { maxAgeMs?: number; expectedRegion?: string },
): Promise<boolean> {
  const maxAgeMs = options?.maxAgeMs ?? 15 * 60 * 1000;
  const timestamp = message.Timestamp;
  const signature = message.Signature;
  const signingCertUrl = message.SigningCertURL;
  const signatureVersion = message.SignatureVersion;

  if (typeof timestamp !== "string" || typeof signature !== "string") {
    return false;
  }
  if (typeof signingCertUrl !== "string" || !isValidSigningCertUrl(signingCertUrl)) {
    return false;
  }
  if (signatureVersion !== "1") {
    return false;
  }

  const messageTime = new Date(timestamp).getTime();
  if (Number.isNaN(messageTime) || Math.abs(Date.now() - messageTime) > maxAgeMs) {
    return false;
  }

  if (options?.expectedRegion) {
    const topicArn = message.TopicArn;
    if (typeof topicArn === "string") {
      const region = extractRegionFromTopicArn(topicArn);
      if (region && region !== options.expectedRegion) {
        return false;
      }
    }
  }

  const response = await fetch(signingCertUrl);
  if (!response.ok) {
    return false;
  }
  const pem = await response.text();
  const cert = new X509Certificate(pem);
  const verifier = createVerify("RSA-SHA1");
  verifier.update(buildStringToSign(message));
  return verifier.verify(cert.publicKey, signature, "base64");
}
