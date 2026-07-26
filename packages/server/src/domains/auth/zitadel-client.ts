import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ISSUER = process.env.ZITADEL_ISSUER ?? "http://localhost:8080";

function loadLoginClientPat(): string {
  if (process.env.ZITADEL_LOGIN_CLIENT_PAT) {
    return process.env.ZITADEL_LOGIN_CLIENT_PAT.trim();
  }

  const paths = [
    join(process.cwd(), "zitadel_keys/login-client.pat"),
    join(process.cwd(), "../../zitadel_keys/login-client.pat"),
  ];

  for (const path of paths) {
    if (existsSync(path)) {
      return readFileSync(path, "utf8").trim();
    }
  }

  throw new Error("ZITADEL login client PAT not found — run pnpm init:zitadel");
}

function base64UrlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

async function startAuthRequest(input: {
  clientId: string;
  redirectUri: string;
  orgId: string;
  codeChallenge: string;
}): Promise<string> {
  const authUrl = new URL(`${ISSUER}/oauth/v2/authorize`);
  authUrl.searchParams.set("client_id", input.clientId);
  authUrl.searchParams.set("redirect_uri", input.redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", `openid profile email urn:zitadel:iam:org:id:${input.orgId}`);
  authUrl.searchParams.set("code_challenge", input.codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  const res = await fetch(authUrl, { redirect: "manual" });
  const location = res.headers.get("location") ?? "";
  const match = location.match(/authRequest=([^&]+)/);
  if (!match?.[1]) {
    throw new Error(`Failed to start OIDC auth request (${location})`);
  }
  return match[1];
}

async function createSession(loginName: string, pat: string) {
  const res = await fetch(`${ISSUER}/v2/sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" },
    body: JSON.stringify({ checks: { user: { loginName } } }),
  });
  const body = (await res.json()) as {
    sessionId?: string;
    sessionToken?: string;
    message?: string;
  };
  if (!res.ok || !body.sessionId || !body.sessionToken) {
    throw new Error(body.message ?? "Invalid email or password");
  }
  return { sessionId: body.sessionId, sessionToken: body.sessionToken };
}

async function verifyPassword(
  sessionId: string,
  sessionToken: string,
  password: string,
  pat: string,
) {
  const res = await fetch(`${ISSUER}/v2/sessions/${sessionId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${pat}`,
      "Content-Type": "application/json",
      "x-zitadel-session-token": sessionToken,
    },
    body: JSON.stringify({ checks: { password: { password } } }),
  });
  const body = (await res.json()) as {
    sessionId?: string;
    sessionToken?: string;
    message?: string;
  };
  if (!res.ok || !body.sessionToken) {
    throw new Error(body.message ?? "Invalid email or password");
  }
  return { sessionId: body.sessionId ?? sessionId, sessionToken: body.sessionToken };
}

async function finalizeAuthRequest(
  authRequestId: string,
  session: { sessionId: string; sessionToken: string },
  pat: string,
): Promise<string> {
  const res = await fetch(`${ISSUER}/v2/oidc/auth_requests/${authRequestId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" },
    body: JSON.stringify({ session }),
  });
  const body = (await res.json()) as { callbackUrl?: string; message?: string };
  if (!res.ok || !body.callbackUrl) {
    throw new Error(body.message ?? "Login finalization failed");
  }
  const code = new URL(body.callbackUrl).searchParams.get("code");
  if (!code) throw new Error("Missing authorization code");
  return code;
}

async function exchangeCode(input: {
  clientId: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}): Promise<{ access_token: string; expires_in?: number }> {
  const res = await fetch(`${ISSUER}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: input.clientId,
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.codeVerifier,
    }),
  });
  const body = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!res.ok || !body.access_token) {
    throw new Error(body.error_description ?? "Token exchange failed");
  }
  return { access_token: body.access_token, expires_in: body.expires_in };
}

export interface LoginSession {
  sessionId: string;
  sessionToken: string;
}

export interface LoginSuccess {
  status: "success";
  accessToken: string;
  expiresIn: number;
}

export interface LoginMfaRequired {
  status: "mfa_required";
  sessionId: string;
  sessionToken: string;
  authRequestId: string;
}

export type LoginResult = LoginSuccess | LoginMfaRequired;

export interface LoginContext {
  orgId: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  authRequestId: string;
}

async function verifyTotpOnSession(
  sessionId: string,
  sessionToken: string,
  code: string,
  pat: string,
): Promise<LoginSession> {
  const res = await fetch(`${ISSUER}/v2/sessions/${sessionId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${pat}`,
      "Content-Type": "application/json",
      "x-zitadel-session-token": sessionToken,
    },
    body: JSON.stringify({ checks: { totp: { code } } }),
  });
  const body = (await res.json()) as {
    sessionId?: string;
    sessionToken?: string;
    message?: string;
  };
  if (!res.ok || !body.sessionToken) {
    throw new Error(body.message ?? "Invalid verification code");
  }
  return { sessionId: body.sessionId ?? sessionId, sessionToken: body.sessionToken };
}

function isMfaRequiredError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("mfa") ||
    lower.includes("second factor") ||
    lower.includes("multifactor") ||
    lower.includes("totp") ||
    lower.includes("otp")
  );
}

export async function loginWithCredentials(input: {
  orgId: string;
  email: string;
  password: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<LoginResult> {
  const pat = loadLoginClientPat();
  const codeChallenge = await pkceChallenge(input.codeVerifier);
  const authRequestId = await startAuthRequest({
    clientId: input.clientId,
    redirectUri: input.redirectUri,
    orgId: input.orgId,
    codeChallenge,
  });

  const session = await createSession(input.email, pat);
  const verified = await verifyPassword(
    session.sessionId,
    session.sessionToken,
    input.password,
    pat,
  );

  try {
    const code = await finalizeAuthRequest(authRequestId, verified, pat);
    const tokens = await exchangeCode({
      clientId: input.clientId,
      redirectUri: input.redirectUri,
      code,
      codeVerifier: input.codeVerifier,
    });
    return {
      status: "success",
      accessToken: tokens.access_token,
      expiresIn: tokens.expires_in ?? 3600,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!isMfaRequiredError(message)) {
      throw err;
    }
    return {
      status: "mfa_required",
      sessionId: verified.sessionId,
      sessionToken: verified.sessionToken,
      authRequestId,
    };
  }
}

export async function completeLoginWithTotp(input: {
  orgId: string;
  sessionId: string;
  sessionToken: string;
  authRequestId: string;
  totpCode: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<{ accessToken: string; expiresIn: number }> {
  const pat = loadLoginClientPat();
  const verified = await verifyTotpOnSession(
    input.sessionId,
    input.sessionToken,
    input.totpCode,
    pat,
  );
  const code = await finalizeAuthRequest(input.authRequestId, verified, pat);
  const tokens = await exchangeCode({
    clientId: input.clientId,
    redirectUri: input.redirectUri,
    code,
    codeVerifier: input.codeVerifier,
  });
  return { accessToken: tokens.access_token, expiresIn: tokens.expires_in ?? 3600 };
}

export async function buildOAuthAuthorizeUrl(input: {
  orgId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  idpId?: string;
}): Promise<string> {
  const authUrl = new URL(`${ISSUER}/oauth/v2/authorize`);
  authUrl.searchParams.set("client_id", input.clientId);
  authUrl.searchParams.set("redirect_uri", input.redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", `openid profile email urn:zitadel:iam:org:id:${input.orgId}`);
  authUrl.searchParams.set("code_challenge", input.codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  if (input.idpId) {
    authUrl.searchParams.set("idp_id", input.idpId);
  }
  return authUrl.toString();
}

export async function exchangeAuthorizationCode(input: {
  clientId: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}): Promise<{ accessToken: string; expiresIn: number }> {
  const tokens = await exchangeCode(input);
  return { accessToken: tokens.access_token, expiresIn: tokens.expires_in ?? 3600 };
}
