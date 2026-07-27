function decodeBase64Url(part: string): string | null {
  try {
    let base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4 !== 0) base64 += "=";
    return new TextDecoder().decode(
      Uint8Array.from(atob(base64), (char: string) => char.charCodeAt(0)),
    );
  } catch {
    return null;
  }
}

/** Decode JWT payload (no signature verification — trust edge/API gateway). */
export function decodeAccessTokenPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  const payloadPart = parts[1];
  if (!payloadPart) return null;

  const json = decodeBase64Url(payloadPart);
  if (!json) return null;

  try {
    const payload = JSON.parse(json) as unknown;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function userIdFromAccessToken(token: string): string | null {
  const sub = decodeAccessTokenPayload(token)?.sub;
  if (typeof sub !== "string") return null;
  const trimmed = sub.trim();
  return trimmed || null;
}
