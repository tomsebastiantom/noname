const OAUTH_VERIFIER_KEY = "noname:oauth_code_verifier";
const OAUTH_STATE_KEY = "noname:oauth_state";

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCodePoint(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function createCodeVerifier(): Promise<string> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export async function createCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

export interface OAuthState {
  storeSlug: string;
  returnUrl: string;
}

export function saveOAuthState(state: OAuthState, codeVerifier: string): void {
  sessionStorage.setItem(OAUTH_VERIFIER_KEY, codeVerifier);
  sessionStorage.setItem(
    OAUTH_STATE_KEY,
    btoa(JSON.stringify(state)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  );
}

export function readOAuthState(): { state: OAuthState; codeVerifier: string } | null {
  const codeVerifier = sessionStorage.getItem(OAUTH_VERIFIER_KEY);
  const encoded = sessionStorage.getItem(OAUTH_STATE_KEY);
  if (!codeVerifier || !encoded) return null;

  try {
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(padded);
    const state = JSON.parse(json) as OAuthState;
    if (!state.storeSlug || typeof state.returnUrl !== "string") return null;
    return { state, codeVerifier };
  } catch {
    return null;
  }
}

export function clearOAuthState(): void {
  sessionStorage.removeItem(OAUTH_VERIFIER_KEY);
  sessionStorage.removeItem(OAUTH_STATE_KEY);
}

export function oauthRedirectUri(): string {
  return `${window.location.protocol}//localhost:5173/auth/callback`;
}
