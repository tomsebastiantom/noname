import { apiFetchData, apiFetchVoid } from "../lib/api";
import { loadOidcConfig } from "./config";
import { createCodeVerifier } from "./oauth";
import { requireStoreSlug } from "./org";
import { setSessionToken } from "./session";

async function loadOidcOrThrow() {
  const oidc = await loadOidcConfig();
  if (!oidc) {
    throw new Error("Missing oidc.json — run pnpm init:zitadel");
  }
  return oidc;
}

export async function requestPasswordReset(storeSlug: string, email: string): Promise<void> {
  await apiFetchVoid(`/api/auth/${storeSlug}/password-reset/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

export async function confirmPasswordReset(
  storeSlug: string,
  input: { userId: string; verificationCode: string; newPassword: string },
): Promise<void> {
  await apiFetchVoid(`/api/auth/${storeSlug}/password-reset/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function registerAccount(
  storeSlug: string,
  input: { email: string; password: string; givenName?: string; familyName?: string },
): Promise<void> {
  await apiFetchVoid(`/api/auth/${storeSlug}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export interface MfaLoginState {
  sessionId: string;
  sessionToken: string;
  authRequestId: string;
  codeVerifier: string;
}

export async function loginWithPassword(
  storeSlug: string,
  email: string,
  password: string,
): Promise<MfaLoginState | null> {
  const oidc = await loadOidcOrThrow();
  const codeVerifier = await createCodeVerifier();

  const data = await apiFetchData<{
    accessToken?: string;
    expiresIn?: number;
    mfaRequired?: boolean;
    sessionId?: string;
    sessionToken?: string;
    authRequestId?: string;
  }>(`/api/auth/${storeSlug}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      codeVerifier,
      clientId: oidc.clientId,
      redirectUri: oidc.redirectUri,
    }),
  });

  if (data.mfaRequired && data.sessionId && data.sessionToken && data.authRequestId) {
    return {
      sessionId: data.sessionId,
      sessionToken: data.sessionToken,
      authRequestId: data.authRequestId,
      codeVerifier,
    };
  }

  if (!data.accessToken) {
    throw new Error("No access token returned");
  }

  setSessionToken(data.accessToken, data.expiresIn ?? 3600);
  return null;
}

export async function verifyMfaAndLogin(
  storeSlug: string,
  state: MfaLoginState,
  totpCode: string,
): Promise<void> {
  const oidc = await loadOidcOrThrow();

  const data = await apiFetchData<{ accessToken?: string; expiresIn?: number }>(
    `/api/auth/${storeSlug}/mfa/verify`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: state.sessionId,
        sessionToken: state.sessionToken,
        authRequestId: state.authRequestId,
        totpCode,
        codeVerifier: state.codeVerifier,
        clientId: oidc.clientId,
        redirectUri: oidc.redirectUri,
      }),
    },
  );

  if (!data.accessToken) {
    throw new Error("No access token returned");
  }

  setSessionToken(data.accessToken, data.expiresIn ?? 3600);
}

export async function startTotpEnrollment(): Promise<{ uri: string; secret: string }> {
  const storeSlug = requireStoreSlug();
  const data = await apiFetchData<{ uri?: string; secret?: string }>(
    `/api/auth/${storeSlug}/mfa/totp/register`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    },
  );

  const uri = data.uri?.trim();
  const secret = data.secret?.trim();
  if (!uri || !secret) {
    throw new Error("No TOTP registration details returned");
  }
  return { uri, secret };
}

export async function confirmTotpEnrollment(code: string): Promise<void> {
  const storeSlug = requireStoreSlug();
  await apiFetchVoid(`/api/auth/${storeSlug}/mfa/totp/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
}
