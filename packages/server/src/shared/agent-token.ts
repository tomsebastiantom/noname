import { createHmac, timingSafeEqual } from "node:crypto";
import { type PermissionKey, isPermissionKey } from "@noname/auth";

const PREFIX = "nag.";

export interface AgentTokenClaims {
  agentId: string;
  agentSlug: string;
  orgId: string;
  onBehalfOf: string;
  permissions: PermissionKey[];
  exp: number;
}

function base64UrlDecode(value: string): string | null {
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

function signPayload(payloadJson: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadJson).digest("base64url");
}

export function verifyAgentToken(token: string, secret: string): AgentTokenClaims | null {
  if (!secret || !token.startsWith(PREFIX)) return null;
  const body = token.slice(PREFIX.length);
  const dot = body.lastIndexOf(".");
  if (dot <= 0) return null;
  const payloadPart = body.slice(0, dot);
  const sigPart = body.slice(dot + 1);
  const payloadJson = base64UrlDecode(payloadPart);
  if (!payloadJson) return null;
  const expected = signPayload(payloadJson, secret);
  try {
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(sigPart))) return null;
  } catch {
    return null;
  }
  try {
    const raw = JSON.parse(payloadJson) as Record<string, unknown>;
    if (typeof raw.agentId !== "string" || typeof raw.agentSlug !== "string") return null;
    if (typeof raw.orgId !== "string" || typeof raw.onBehalfOf !== "string") return null;
    if (typeof raw.exp !== "number" || raw.exp * 1000 <= Date.now()) return null;
    const permissions: PermissionKey[] = [];
    if (Array.isArray(raw.permissions)) {
      for (const entry of raw.permissions) {
        if (typeof entry === "string" && isPermissionKey(entry)) {
          permissions.push(entry);
        }
      }
    }
    return {
      agentId: raw.agentId,
      agentSlug: raw.agentSlug,
      orgId: raw.orgId,
      onBehalfOf: raw.onBehalfOf,
      permissions,
      exp: raw.exp,
    };
  } catch {
    return null;
  }
}

export function isAgentToken(token: string): boolean {
  return token.startsWith(PREFIX);
}
