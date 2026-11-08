import { createSign } from "node:crypto";

/**
 * ZITADEL service-account credentials and OAuth token exchange.
 *
 * Two standard calls:
 *   1. `private_key_jwt` (RFC 7523) → access token for the agent's service account (the actor).
 *   2. Token exchange (RFC 8693) → a token for the user, with the agent as `act`.
 *
 * The private key stays with the caller (secret manager); ZITADEL holds the public key.
 */
export type ServiceAccountKey = {
  type: "serviceaccount";
  keyId: string;
  key: string;
  userId: string;
};

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function base64url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

export function buildServiceAccountAssertion(
  key: ServiceAccountKey,
  issuer: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const header = { alg: "RS256", typ: "JWT", kid: key.keyId };
  const payload = {
    iss: key.userId,
    sub: key.userId,
    aud: issuer,
    iat: nowSeconds,
    exp: nowSeconds + 300,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  return `${signingInput}.${base64url(signer.sign(key.key))}`;
}

export type TokenResponse = {
  accessToken: string;
  expiresIn: number;
  tokenType: string;
};

function parseTokenResponse(body: unknown): TokenResponse | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (typeof record.access_token !== "string" || record.access_token === "") return null;
  return {
    accessToken: record.access_token,
    expiresIn: typeof record.expires_in === "number" ? record.expires_in : 0,
    tokenType: typeof record.token_type === "string" ? record.token_type : "Bearer",
  };
}

/** RFC 7523: exchange a signed service-account assertion for an access token. */
export async function serviceAccountToken(
  input: { issuer: string; key: ServiceAccountKey; scopes?: string },
  fetchImpl: FetchLike = fetch,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: buildServiceAccountAssertion(input.key, input.issuer),
    scope: input.scopes ?? "openid",
  });

  const response = await fetchImpl(`${input.issuer.replace(/\/$/, "")}/oauth/v2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    throw new Error(`ZITADEL service-account token failed: HTTP ${response.status}`);
  }
  const parsed = parseTokenResponse(await response.json());
  if (!parsed) throw new Error("ZITADEL service-account token returned no access_token");
  return parsed;
}

/** RFC 8693: user (subject) + agent service account (actor) → delegated token with `act`. */
export async function exchangeDelegatedToken(
  input: {
    issuer: string;
    actorToken: string;
    subjectToken: string;
    subjectTokenType?: string;
    scopes?: string;
    audience?: string;
  },
  fetchImpl: FetchLike = fetch,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    actor_token: input.actorToken,
    actor_token_type: "urn:ietf:params:oauth:token-type:access_token",
    subject_token: input.subjectToken,
    subject_token_type:
      input.subjectTokenType ?? "urn:ietf:params:oauth:token-type:access_token",
    requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
  });
  if (input.scopes) body.set("scope", input.scopes);
  if (input.audience) body.set("audience", input.audience);

  const response = await fetchImpl(`${input.issuer.replace(/\/$/, "")}/oauth/v2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    throw new Error(`ZITADEL token exchange failed: HTTP ${response.status}`);
  }
  const parsed = parseTokenResponse(await response.json());
  if (!parsed) throw new Error("ZITADEL token exchange returned no access_token");
  return parsed;
}
