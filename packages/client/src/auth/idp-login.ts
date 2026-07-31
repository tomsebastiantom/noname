import { loadOidcConfig } from "./config";
import {
  clearOAuthState,
  createCodeChallenge,
  createCodeVerifier,
  oauthRedirectUri,
  readOAuthState,
  saveOAuthState,
} from "./oauth";
import { setSessionToken } from "./session";

export async function startIdpLogin(
  storeSlug: string,
  provider: string,
  redirectPath: string,
): Promise<void> {
  const oidc = await loadOidcConfig();
  if (!oidc) {
    throw new Error("Missing oidc.json — run pnpm init:zitadel");
  }

  const codeVerifier = await createCodeVerifier();
  const codeChallenge = await createCodeChallenge(codeVerifier);
  const returnUrl = new URL(redirectPath, window.location.origin).toString();
  saveOAuthState({ storeSlug, returnUrl }, codeVerifier);

  const params = new URLSearchParams({
    clientId: oidc.clientId,
    redirectUri: oauthRedirectUri(),
    codeChallenge,
  });

  const res = await fetch(`/api/auth/${storeSlug}/idp/${provider}/start?${params.toString()}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Could not start ${provider} sign-in (${res.status})`);
  }

  const body = (await res.json()) as { data?: { authorizeUrl?: string } };
  if (!body.data?.authorizeUrl) {
    throw new Error("Missing authorize URL");
  }

  window.location.href = body.data.authorizeUrl;
}

export async function completeOAuthCallback(code: string): Promise<string> {
  const saved = readOAuthState();
  if (!saved) {
    throw new Error("OAuth session expired — try signing in again");
  }

  const oidc = await loadOidcConfig();
  if (!oidc) {
    throw new Error("Missing oidc.json — run pnpm init:zitadel");
  }

  const res = await fetch(`/api/auth/${saved.state.storeSlug}/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      codeVerifier: saved.codeVerifier,
      clientId: oidc.clientId,
      redirectUri: oauthRedirectUri(),
    }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Sign-in failed (${res.status})`);
  }

  const body = (await res.json()) as { data?: { accessToken?: string; expiresIn?: number } };
  if (!body.data?.accessToken) {
    throw new Error("No access token returned");
  }

  setSessionToken(body.data.accessToken, body.data.expiresIn ?? 3600);
  clearOAuthState();
  return saved.state.returnUrl;
}
