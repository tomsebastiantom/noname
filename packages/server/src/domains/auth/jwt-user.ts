function decodeJwtPayloadPart(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const payloadPart = parts[1];
  if (!payloadPart) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Decode JWT access token payload (no signature verification — trust edge/API gateway). */
export function decodeAccessTokenPayload(token: string): Record<string, unknown> | null {
  return decodeJwtPayloadPart(token);
}

/** Read ZITADEL user id (`sub`) from a JWT access token payload. */
export function userIdFromAccessToken(token: string): string | null {
  const payload = decodeJwtPayloadPart(token);
  const sub = payload?.sub;
  if (typeof sub !== "string") return null;
  const trimmed = sub.trim();
  return trimmed || null;
}
