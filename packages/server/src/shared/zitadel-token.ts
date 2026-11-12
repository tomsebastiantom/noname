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

/** Typed IdP failure so callers can map credential errors (401/403) separately from IdP outages (503). */
export class ZitadelTokenError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly errorCode: string | null = null,
    public readonly description: string | null = null,
  ) {
    super(message);
    this.name = "ZitadelTokenError";
  }
}

async function tokenError(prefix: string, response: Response): Promise<ZitadelTokenError> {
  const text = await response.text();
  let errorCode: string | null = null;
  let description: string | null = null;
  try {
    const parsed = JSON.parse(text) as { error?: unknown; error_description?: unknown };
    if (typeof parsed.error === "string") errorCode = parsed.error;
    if (typeof parsed.error_description === "string") description = parsed.error_description;
  } catch {
    // Non-JSON error body; keep the status only.
  }
  return new ZitadelTokenError(
    `${prefix}: HTTP ${response.status}${errorCode ? ` ${errorCode}` : ""}${description ? `: ${description}` : ""}`,
    response.status,
    errorCode,
    description,
  );
}

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
  /** Present when the exchange requests `openid`; carries the subject's ID-token claims. */
  idToken?: string;
  /** RFC 8693 response field; validated against the requested token type. */
  issuedTokenType?: string;
};

function parseTokenResponse(body: unknown): TokenResponse | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (typeof record.access_token !== "string" || record.access_token === "") return null;
  return {
    accessToken: record.access_token,
    expiresIn: typeof record.expires_in === "number" ? record.expires_in : 0,
    tokenType: typeof record.token_type === "string" ? record.token_type : "Bearer",
    idToken: typeof record.id_token === "string" ? record.id_token : undefined,
    issuedTokenType:
      typeof record.issued_token_type === "string" ? record.issued_token_type : undefined,
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
    throw await tokenError("ZITADEL service-account token failed", response);
  }
  const parsed = parseTokenResponse(await response.json());
  if (!parsed) throw new Error("ZITADEL service-account token returned no access_token");
  return parsed;
}

/** RFC 8693: user (subject) + agent service account (actor) → delegated token with `act`. */
export async function exchangeDelegatedToken(
  input: {
    issuer: string;
    clientId?: string;
    clientSecret?: string;
    actorToken: string;
    subjectToken: string;
    subjectTokenType?: string;
    scopes?: string;
    audience?: string;
    requestedTokenType?:
      | "urn:ietf:params:oauth:token-type:access_token"
      | "urn:ietf:params:oauth:token-type:jwt";
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
    requested_token_type:
      input.requestedTokenType ?? "urn:ietf:params:oauth:token-type:access_token",
  });
  if (input.scopes) body.set("scope", input.scopes);
  if (input.audience) body.set("audience", input.audience);

  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
  };
  if (input.clientId && input.clientSecret) {
    headers.authorization = `Basic ${Buffer.from(`${input.clientId}:${input.clientSecret}`).toString("base64")}`;
  }

  const response = await fetchImpl(`${input.issuer.replace(/\/$/, "")}/oauth/v2/token`, {
    method: "POST",
    headers,
    body,
  });
  if (!response.ok) {
    throw await tokenError("ZITADEL token exchange failed", response);
  }
  const parsed = parseTokenResponse(await response.json());
  if (!parsed) throw new Error("ZITADEL token exchange returned no access_token");
  const expected = input.requestedTokenType ?? "urn:ietf:params:oauth:token-type:access_token";
  if (parsed.issuedTokenType !== expected) {
    throw new ZitadelTokenError(
      `ZITADEL token exchange issued ${parsed.issuedTokenType ?? "no type"}, expected ${expected}`,
      502,
      "invalid_issued_token_type",
    );
  }
  return parsed;
}
