import { apiFetchData } from "../lib/api";
import { loadOidcConfig } from "./config";
import {
  clearOAuthState,
  createCodeChallenge,
  createCodeVerifier,
  oauthRedirectUri,
  readOAuthState,
  saveOAuthState,
} from "./oauth";
import { setSessionIdentity, setSessionToken } from "./session";

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

  const data = await apiFetchData<{ authorizeUrl?: string }>(
    `/api/auth/${storeSlug}/idp/${provider}/start?${params.toString()}`,
  ).catch((err: unknown) => {
    throw new Error(
      err instanceof Error && !err.message.startsWith("HTTP")
        ? err.message
        : `Could not start ${provider} sign-in`,
    );
  });
  if (!data?.authorizeUrl) {
    throw new Error("Missing authorize URL");
  }

  window.location.href = data.authorizeUrl;
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

  const data = await apiFetchData<{
    accessToken?: string;
    expiresIn?: number;
    email?: string | null;
    displayName?: string | null;
  }>(`/api/auth/${saved.state.storeSlug}/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      codeVerifier: saved.codeVerifier,
      clientId: oidc.clientId,
      redirectUri: oauthRedirectUri(),
    }),
  }).catch((err: unknown) => {
    throw new Error(
      err instanceof Error && !err.message.startsWith("HTTP") ? err.message : "Sign-in failed",
    );
  });
  if (!data?.accessToken) {
    throw new Error("No access token returned");
  }

  setSessionToken(data.accessToken, data.expiresIn ?? 3600);
  setSessionIdentity({
    email: data.email ?? null,
    displayName: data.displayName ?? null,
  });
  clearOAuthState();
  return saved.state.returnUrl;
}
