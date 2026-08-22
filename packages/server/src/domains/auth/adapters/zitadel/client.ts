import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fetchUserinfo as fetchUserinfoFromIssuer } from "@noname/auth";
import { ServiceUnavailableError, UnauthorizedError } from "../../../../shared/domain-error";
import { zitadelIssuer } from "./issuer";

/** Scope required for end-user tokens to call ZITADEL user APIs (e.g. TOTP enrollment). */
const ZITADEL_USER_API_SCOPE = "urn:zitadel:iam:org:project:id:zitadel:aud";

/** Platform project audience — required for project roles in JWT when projectRoleAssertion is on. */
function platformProjectScope(): string | null {
  const projectId = process.env.ZITADEL_PROJECT_ID?.trim();
  if (!projectId) return null;
  return `urn:zitadel:iam:org:project:id:${projectId}:aud`;
}

/** Request project role claims for projects in the token audience. */
const PLATFORM_ROLES_SCOPE = "urn:zitadel:iam:org:projects:roles";

function oidcScope(orgId: string): string {
  const parts = [
    "openid",
    "profile",
    "email",
    `urn:zitadel:iam:org:id:${orgId}`,
    ZITADEL_USER_API_SCOPE,
    PLATFORM_ROLES_SCOPE,
  ];
  const platformScope = platformProjectScope();
  if (platformScope) parts.push(platformScope);
  return parts.join(" ");
}

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

  throw new ServiceUnavailableError("ZITADEL login client PAT not found — run pnpm init:zitadel");
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
  const authUrl = new URL(`${zitadelIssuer()}/oauth/v2/authorize`);
  authUrl.searchParams.set("client_id", input.clientId);
  authUrl.searchParams.set("redirect_uri", input.redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", oidcScope(input.orgId));
  authUrl.searchParams.set("code_challenge", input.codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  const res = await fetch(authUrl, { redirect: "manual" });
  const location = res.headers.get("location") ?? "";
  const match = location.match(/authRequest=([^&]+)/);
  if (!match?.[1]) {
    throw new ServiceUnavailableError(`Failed to start OIDC auth request (${location})`);
  }
  return match[1];
}

async function createSession(loginName: string, pat: string) {
  const res = await fetch(`${zitadelIssuer()}/v2/sessions`, {
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
    throw new UnauthorizedError(body.message ?? "Invalid email or password");
  }
  return { sessionId: body.sessionId, sessionToken: body.sessionToken };
}

async function verifyPassword(
  sessionId: string,
  sessionToken: string,
  password: string,
  pat: string,
) {
  const res = await fetch(`${zitadelIssuer()}/v2/sessions/${sessionId}`, {
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
    throw new UnauthorizedError(body.message ?? "Invalid email or password");
  }
  return { sessionId: body.sessionId ?? sessionId, sessionToken: body.sessionToken };
}

async function finalizeAuthRequest(
  authRequestId: string,
  session: { sessionId: string; sessionToken: string },
  pat: string,
): Promise<string> {
  const res = await fetch(`${zitadelIssuer()}/v2/oidc/auth_requests/${authRequestId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" },
    body: JSON.stringify({ session }),
  });
  const body = (await res.json()) as { callbackUrl?: string; message?: string };
  if (!res.ok || !body.callbackUrl) {
    throw new UnauthorizedError(body.message ?? "Login finalization failed");
  }
  const code = new URL(body.callbackUrl).searchParams.get("code");
  if (!code) throw new UnauthorizedError("Missing authorization code");
  return code;
}

async function exchangeCode(input: {
  clientId: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}): Promise<{ access_token: string; expires_in?: number; id_token?: string }> {
  const res = await fetch(`${zitadelIssuer()}/oauth/v2/token`, {
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
    id_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!res.ok || !body.access_token) {
    throw new UnauthorizedError(body.error_description ?? "Token exchange failed");
  }
  return { access_token: body.access_token, expires_in: body.expires_in, id_token: body.id_token };
}

/** Human identity claims live in the ID token, never the access token — decode locally, no userinfo round trip. */
export function identityFromIdToken(idToken: string | undefined): {
  email: string | null;
  displayName: string | null;
} {
  if (!idToken) return { email: null, displayName: null };
  try {
    const payloadPart = idToken.split(".")[1];
    if (!payloadPart) return { email: null, displayName: null };
    let base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4 !== 0) base64 += "=";
    const payload = JSON.parse(Buffer.from(base64, "base64").toString("utf8")) as Record<
      string,
      unknown
    >;
    const email =
      typeof payload.email === "string" && payload.email.trim() ? payload.email.trim() : null;
    const name =
      typeof payload.name === "string" && payload.name.trim()
        ? payload.name.trim()
        : typeof payload.preferred_username === "string" && payload.preferred_username.trim()
          ? payload.preferred_username.trim()
          : null;
    return { email, displayName: name ?? email };
  } catch {
    return { email: null, displayName: null };
  }
}

/** Human identity claims live in the ID token for most OIDC providers; ZITADEL omits them
 *  (tokens carry only sub + urn:zitadel:* claims), so fall back to userinfo once per login. */
export async function resolveLoginIdentity(
  accessToken: string,
  idToken: string | undefined,
): Promise<{ email: string | null; displayName: string | null }> {
  const fromIdToken = identityFromIdToken(idToken);
  if (fromIdToken.displayName) return fromIdToken;
  try {
    const info = await fetchUserinfo(accessToken);
    const email = typeof info.email === "string" && info.email.trim() ? info.email.trim() : null;
    const name =
      typeof info.name === "string" && info.name.trim()
        ? info.name.trim()
        : typeof info.preferred_username === "string" && info.preferred_username.trim()
          ? info.preferred_username.trim()
          : null;
    return { email, displayName: name ?? email };
  } catch {
    return fromIdToken;
  }
}

/** OIDC userinfo — includes project roles when not present in access token JWT. */
export async function fetchUserinfo(accessToken: string): Promise<Record<string, unknown>> {
  return fetchUserinfoFromIssuer(accessToken, zitadelIssuer());
}

export interface LoginSession {
  sessionId: string;
  sessionToken: string;
}

export interface LoginSuccess {
  status: "success";
  accessToken: string;
  expiresIn: number;
  email: string | null;
  displayName: string | null;
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
  const res = await fetch(`${zitadelIssuer()}/v2/sessions/${sessionId}`, {
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
    throw new UnauthorizedError(body.message ?? "Invalid verification code");
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
      ...(await resolveLoginIdentity(tokens.access_token, tokens.id_token)),
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
}): Promise<{
  accessToken: string;
  expiresIn: number;
  email: string | null;
  displayName: string | null;
}> {
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
  return {
    accessToken: tokens.access_token,
    expiresIn: tokens.expires_in ?? 3600,
    ...(await resolveLoginIdentity(tokens.access_token, tokens.id_token)),
  };
}

export async function buildOAuthAuthorizeUrl(input: {
  orgId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  idpId?: string;
}): Promise<string> {
  const authUrl = new URL(`${zitadelIssuer()}/oauth/v2/authorize`);
  authUrl.searchParams.set("client_id", input.clientId);
  authUrl.searchParams.set("redirect_uri", input.redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", oidcScope(input.orgId));
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
}): Promise<{
  accessToken: string;
  expiresIn: number;
  email: string | null;
  displayName: string | null;
}> {
  const tokens = await exchangeCode(input);
  return {
    accessToken: tokens.access_token,
    expiresIn: tokens.expires_in ?? 3600,
    ...(await resolveLoginIdentity(tokens.access_token, tokens.id_token)),
  };
}
