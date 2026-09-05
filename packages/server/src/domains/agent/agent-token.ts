import { createHmac } from "node:crypto";
import { ServiceUnavailableError } from "../../shared/domain-error";
import type { AgentTokenClaims } from "../../shared/agent-token";

const PREFIX = "nag.";

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function signPayload(payloadJson: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadJson).digest("base64url");
}

export function mintAgentToken(claims: AgentTokenClaims, secret: string): string {
  if (!secret) {
    throw new ServiceUnavailableError("AGENT_TOKEN_SECRET is required to mint agent tokens");
  }
  const payloadJson = JSON.stringify(claims);
  return `${PREFIX}${base64UrlEncode(payloadJson)}.${signPayload(payloadJson, secret)}`;
}
