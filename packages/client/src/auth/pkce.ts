import { loadOidcConfig } from "./config";

const STORAGE_TOKEN = "noname:access_token";
const COOKIE_NAME = "access_token";

interface OidcState {
  n: string;
  v: string;
  o: string;
  p: string;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCodePoint(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.codePointAt(i) ?? 0;
  return bytes;
}

async function createCodeVerifier(): Promise<string> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function createCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

function encodeState(state: OidcState): string {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(state)));
}

function decodeState(value: string): OidcState {
  const json = new TextDecoder().decode(base64UrlDecode(value));
  return JSON.parse(json) as OidcState;
}

function setTokenCookie(token: string, maxAgeSec: number): void {
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(token)}; path=/; domain=.localhost; SameSite=Lax; max-age=${maxAgeSec}`;
}

function clearTokenCookie(): void {
  document.cookie = `${COOKIE_NAME}=; path=/; domain=.localhost; SameSite=Lax; max-age=0`;
}

/** Copy token from .localhost cookie (set on /callback) into sessionStorage for this origin. */
export function hydrateTokenFromCookie(): void {
  if (getAccessToken()) return;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  const raw = match?.[1];
  if (!raw) return;
  sessionStorage.setItem(STORAGE_TOKEN, decodeURIComponent(raw));
}

export function getAccessToken(): string | null {
  return sessionStorage.getItem(STORAGE_TOKEN);
}

export function clearSession(): void {
  sessionStorage.removeItem(STORAGE_TOKEN);
  clearTokenCookie();
}

export function isLoggedIn(): boolean {
  hydrateTokenFromCookie();
  return getAccessToken() !== null;
}

export async function startLogin(orgId: string): Promise<void> {
  const oidc = await loadOidcConfig();
  if (!oidc) {
    throw new Error("Missing oidc.json — run pnpm init:zitadel");
  }

  const verifier = await createCodeVerifier();
  const challenge = await createCodeChallenge(verifier);
  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);

  const state = encodeState({
    n: base64UrlEncode(nonceBytes),
    v: verifier,
    o: window.location.origin,
    p: `${window.location.pathname}${window.location.search}`,
  });

  const params = new URLSearchParams({
    client_id: oidc.clientId,
    redirect_uri: oidc.redirectUri,
    response_type: "code",
    scope: `openid profile email urn:zitadel:iam:org:id:${orgId}`,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  });

  window.location.assign(`${oidc.issuer}/oauth/v2/authorize?${params}`);
}

export async function handleCallback(): Promise<string> {
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");
  if (error) {
    throw new Error(params.get("error_description") ?? error);
  }

  const code = params.get("code");
  const stateRaw = params.get("state");
  if (!code) throw new Error("Missing authorization code");
  if (!stateRaw) throw new Error("Missing state — start login again");

  const state = decodeState(stateRaw);
  const oidc = await loadOidcConfig();
  if (!oidc) throw new Error("Missing oidc.json — run pnpm init:zitadel");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: oidc.clientId,
    code,
    redirect_uri: oidc.redirectUri,
    code_verifier: state.v,
  });

  const res = await fetch(`${oidc.issuer}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }

  const tokens = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!tokens.access_token) throw new Error("No access_token in response");

  const maxAge = tokens.expires_in ?? 3600;
  sessionStorage.setItem(STORAGE_TOKEN, tokens.access_token);
  setTokenCookie(tokens.access_token, maxAge);

  return `${state.o}${state.p}`;
}

export function apiHeaders(): HeadersInit {
  hydrateTokenFromCookie();
  const token = getAccessToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}
