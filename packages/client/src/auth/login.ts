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

/** Embedded login via API → ZITADEL Session API (password grant is not supported by ZITADEL). */
export async function loginWithPassword(
  orgId: string,
  email: string,
  password: string,
): Promise<void> {
  const oidc = await loadOidcConfig();
  if (!oidc) {
    throw new Error("Missing oidc.json — run pnpm init:zitadel");
  }

  const codeVerifier = await createCodeVerifier();

  const res = await fetch(`/api/tenants/${orgId}/auth/login`, {
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

  const body = (await res.json()) as { data?: { accessToken?: string; expiresIn?: number } };
  if (!body.data?.accessToken) {
    throw new Error("No access token returned");
  }

  setSessionToken(body.data.accessToken, body.data.expiresIn ?? 3600);
}
