const STORAGE_TOKEN = "noname:access_token";
const COOKIE_NAME = "access_token";

function setTokenCookie(token: string, maxAgeSec: number): void {
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(token)}; path=/; domain=.localhost; SameSite=Lax; max-age=${maxAgeSec}`;
}

function clearTokenCookie(): void {
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
