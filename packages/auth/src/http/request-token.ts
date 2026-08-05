type TokenRequest = {
  headers: Headers;
  url?: string;
};

/** Bearer header, `?access_token=` query (EventSource), or `access_token` cookie. */
export function accessTokenFromRequest(request: TokenRequest): string | null {
  const authHeader = request.headers.get("Authorization") || "";
  const fromBearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (fromBearer) return fromBearer;

  if (request.url) {
    const queryToken = new URL(request.url).searchParams.get("access_token")?.trim();
    if (queryToken) return queryToken;
  }

  const cookie = request.headers.get("Cookie") || "";
  const fromCookie = cookie.match(/access_token=([^;]+)/)?.[1];
  if (fromCookie) {
    try {
      return decodeURIComponent(fromCookie);
    } catch {
      return fromCookie;
    }
  }

  return null;
}
