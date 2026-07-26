import { loadOidcConfig } from "./config";
import { setSessionToken } from "./session";

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCodePoint(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function createCodeVerifier(): Promise<string> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function loadOidcOrThrow() {
  const oidc = await loadOidcConfig();
  if (!oidc) {
    throw new Error("Missing oidc.json — run pnpm init:zitadel");
  }
  return oidc;
}

export async function requestPasswordReset(storeSlug: string, email: string): Promise<void> {
  const res = await fetch(`/api/tenants/${storeSlug}/auth/password-reset/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Password reset request failed (${res.status})`);
  }
}

export async function confirmPasswordReset(
  storeSlug: string,
  input: { userId: string; verificationCode: string; newPassword: string },
): Promise<void> {
  const res = await fetch(`/api/tenants/${storeSlug}/auth/password-reset/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Password reset failed (${res.status})`);
  }
}

export async function registerAccount(
  storeSlug: string,
  input: { email: string; password: string; givenName?: string; familyName?: string },
): Promise<void> {
  const res = await fetch(`/api/tenants/${storeSlug}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Registration failed (${res.status})`);
  }
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

  const res = await fetch(`/api/tenants/${storeSlug}/auth/login`, {
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

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Sign-in failed (${res.status})`);
  }

  const body = (await res.json()) as {
    data?: {
      accessToken?: string;
      expiresIn?: number;
      mfaRequired?: boolean;
      sessionId?: string;
      sessionToken?: string;
      authRequestId?: string;
    };
  };

  if (body.data?.mfaRequired && body.data.sessionId && body.data.sessionToken && body.data.authRequestId) {
    return {
      sessionId: body.data.sessionId,
      sessionToken: body.data.sessionToken,
      authRequestId: body.data.authRequestId,
      codeVerifier,
    };
  }

  if (!body.data?.accessToken) {
    throw new Error("No access token returned");
  }

  setSessionToken(body.data.accessToken, body.data.expiresIn ?? 3600);
  return null;
}

export async function verifyMfaAndLogin(storeSlug: string, state: MfaLoginState, totpCode: string): Promise<void> {
  const oidc = await loadOidcOrThrow();

  const res = await fetch(`/api/tenants/${storeSlug}/auth/mfa/verify`, {
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
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `MFA verification failed (${res.status})`);
  }

  const body = (await res.json()) as { data?: { accessToken?: string; expiresIn?: number } };
  if (!body.data?.accessToken) {
    throw new Error("No access token returned");
  }

  setSessionToken(body.data.accessToken, body.data.expiresIn ?? 3600);
}
