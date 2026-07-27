/** Bearer token or `access_token` cookie value from a fetch Request. */
export function accessTokenFromRequest(request: { headers: Headers }): string | null {
  const authHeader = request.headers.get("Authorization") || "";
  const fromBearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (fromBearer) return fromBearer;

  const cookie = request.headers.get("Cookie") || "";
  return cookie.match(/access_token=([^;]+)/)?.[1] ?? null;
}
