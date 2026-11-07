import { createHmac, timingSafeEqual } from "node:crypto";
import { isPermissionKey, type PermissionKey } from "@noname/auth";

/**
 * Service tokens — a credential for background work that is neither a human nor an agent.
 *
 * Format: `nsv.<base64url(payload)>.<base64url(hmac-sha256(payload))>`.
 *
 * Why not reuse a human JWT: an eval run must read definitions for one org without borrowing a person's
 * identity or holding a write permission. Why not reuse the agent token: agents are deliberately barred from
 * `MACHINES_DEFINE` and are scoped to draft work, and conflating the two would make "which principal did this"
 * unanswerable. The secret is `SERVICE_TOKEN_SECRET`, falling back to `WORKER_SERVER_SECRET` for local setups.
 */
const PREFIX = "nsv.";

export type ServiceTokenClaims = {
  serviceId: string;
  orgId: string;
  permissions: PermissionKey[];
  /** Seconds since epoch. */
  exp: number;
};

export function serviceTokenSecret(): string {
  return process.env.SERVICE_TOKEN_SECRET?.trim() || process.env.WORKER_SERVER_SECRET?.trim() || "";
}

function signPayload(payloadJson: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadJson).digest("base64url");
}

export function signServiceToken(
  claims: ServiceTokenClaims,
  secret = serviceTokenSecret(),
): string {
  if (!secret) {
    throw new Error(
      "SERVICE_TOKEN_SECRET (or WORKER_SERVER_SECRET) is required to sign a service token",
    );
  }
  const payload = JSON.stringify(claims);
  const encoded = Buffer.from(payload, "utf8").toString("base64url");
  return `${PREFIX}${encoded}.${signPayload(payload, secret)}`;
}

export function verifyServiceToken(
  token: string,
  secret = serviceTokenSecret(),
): ServiceTokenClaims | null {
  if (!secret || !token.startsWith(PREFIX)) return null;

  const body = token.slice(PREFIX.length);
  const dot = body.lastIndexOf(".");
  if (dot <= 0) return null;

  const payloadPart = body.slice(0, dot);
  const signaturePart = body.slice(dot + 1);

  let payloadJson: string;
  try {
    payloadJson = Buffer.from(payloadPart, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const expected = signPayload(payloadJson, secret);
  try {
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signaturePart))) return null;
  } catch {
    return null;
  }

  try {
    const raw = JSON.parse(payloadJson) as Record<string, unknown>;
    if (typeof raw.serviceId !== "string" || raw.serviceId.trim() === "") return null;
    if (typeof raw.orgId !== "string" || raw.orgId.trim() === "") return null;
    if (typeof raw.exp !== "number" || raw.exp * 1000 <= Date.now()) return null;

    const permissions: PermissionKey[] = [];
    if (Array.isArray(raw.permissions)) {
      for (const entry of raw.permissions) {
        if (typeof entry !== "string" || !isPermissionKey(entry)) return null;
        permissions.push(entry);
      }
    }

    return {
      serviceId: raw.serviceId,
      orgId: raw.orgId,
      permissions,
      exp: raw.exp,
    };
  } catch {
    return null;
  }
}
