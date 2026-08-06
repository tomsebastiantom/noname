const STORAGE_TOKEN = "noname:access_token";
const COOKIE_NAME = "access_token";

function setTokenCookie(token: string, maxAgeSec: number): void {
  // biome-ignore lint/suspicious/noDocumentCookie: sync JWT across *.localhost subdomains in dev
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(token)}; path=/; domain=.localhost; SameSite=Lax; max-age=${maxAgeSec}`;
}

function clearTokenCookie(): void {
  // biome-ignore lint/suspicious/noDocumentCookie: sync JWT across *.localhost subdomains in dev
  document.cookie = `${COOKIE_NAME}=; path=/; domain=.localhost; SameSite=Lax; max-age=0`;
}

export function setSessionToken(token: string, maxAgeSec: number): void {
  sessionStorage.setItem(STORAGE_TOKEN, token);
  setTokenCookie(token, maxAgeSec);
}

export function getAccessToken(): string | null {
  return sessionStorage.getItem(STORAGE_TOKEN);
}

export function clearSession(): void {
  sessionStorage.removeItem(STORAGE_TOKEN);
  clearTokenCookie();
}

/** Redirect to login after API 401 — preserves return path unless already on login. */
export function redirectToLoginAfterUnauthorized(): void {
  if (typeof window === "undefined") return;
  const path = window.location.pathname;
  if (path.startsWith("/login")) return;
  clearSession();
  const redirect = encodeURIComponent(path + window.location.search);
  window.location.assign(`/login?redirect=${redirect}`);
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const payloadPart = token.split(".")[1];
  if (!payloadPart) return null;
  try {
    let base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4 !== 0) base64 += "=";
    const json = atob(base64);
    const payload = JSON.parse(json) as unknown;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** ZITADEL `sub` from stored access token (no signature verify — same as edge trust model). */
export function sessionUserId(): string | null {
  hydrateTokenFromCookie();
  const token = getAccessToken();
  if (!token) return null;
  const sub = decodeJwtPayload(token)?.sub;
  if (typeof sub !== "string") return null;
  const trimmed = sub.trim();
  return trimmed || null;
}

/** Optional email claim from JWT for observability attribution. */
export function sessionUserEmail(): string | null {
  hydrateTokenFromCookie();
  const token = getAccessToken();
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  const email = payload?.email;
  if (typeof email !== "string") return null;
  const trimmed = email.trim();
  return trimmed || null;
}

/** Copy token from `.localhost` cookie into sessionStorage for this origin. */
export function hydrateTokenFromCookie(): void {
  if (getAccessToken()) return;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  const raw = match?.[1];
  if (!raw) return;
  sessionStorage.setItem(STORAGE_TOKEN, decodeURIComponent(raw));
}

export function isLoggedIn(): boolean {
  hydrateTokenFromCookie();
  return getAccessToken() !== null;
}

export function apiHeaders(): HeadersInit {
  hydrateTokenFromCookie();
  const token = getAccessToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}
