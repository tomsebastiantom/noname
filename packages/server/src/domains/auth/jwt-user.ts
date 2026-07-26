/** Read ZITADEL user id (`sub`) from a JWT access token payload. */
export function userIdFromAccessToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const payloadPart = parts[1];
  if (!payloadPart) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as {
      sub?: string;
    };
    const sub = payload.sub?.trim();
    return sub || null;
  } catch {
    return null;
  }
}
