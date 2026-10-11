/**
 * Test-only RS256 token minting for origin-side verification.
 *
 * The permission tests previously fabricated tokens with a placeholder
 * signature (`header.<payload>.sig`), which only worked because the origin
 * never verified signatures. Now that verification is mandatory, tests must
 * mint genuinely signed tokens — and the shared helper makes that a one-line
 * change per file.
 *
 * Signing is synchronous (`node:crypto`) so existing call sites that build
 * tokens at module scope keep working unchanged.
 */

import { generateKeyPairSync, sign as signRsa } from "node:crypto";
import { vi } from "vitest";
import { resetZitadelJwksCache } from "../adapters/zitadel/jwks";

export const TEST_ISSUER = "https://issuer.test";
export const TEST_AUDIENCE = "test-client";
export const TEST_KID = "test-kid";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

const publicJwk = {
  ...publicKey.export({ format: "jwk" }),
  kid: TEST_KID,
  alg: "RS256",
  use: "sig",
};

export interface TestTokenOptions {
  /** Override `iss` to exercise issuer rejection. */
  issuer?: string;
  /** Override `aud`; pass `null` to omit the claim entirely. */
  audience?: string | string[] | null;
  /** Signed lifetime in seconds; use a negative value for an expired token. */
  expiresInSec?: number;
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

/** Mint a correctly signed access token. Payload claims win over the defaults. */
export function signTestToken(
  payload: Record<string, unknown>,
  options: TestTokenOptions = {},
): string {
  const now = Math.floor(Date.now() / 1000);
  const audience = options.audience === undefined ? TEST_AUDIENCE : options.audience;
  const claims: Record<string, unknown> = {
    iss: options.issuer ?? TEST_ISSUER,
    iat: now,
    exp: now + (options.expiresInSec ?? 3600),
    ...(audience === null ? {} : { aud: audience }),
    ...payload,
  };

  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: TEST_KID }));
  const body = b64url(JSON.stringify(claims));
  const signingInput = `${header}.${body}`;
  const signature = signRsa("RSA-SHA256", Buffer.from(signingInput), privateKey);
  return `${signingInput}.${b64url(signature)}`;
}

/** Mint a token with a broken signature (for rejection tests). */
export function signTokenWithTamperedSignature(payload: Record<string, unknown>): string {
  const token = signTestToken(payload);
  const [header, body, signature] = token.split(".") as [string, string, string];
  const tail = signature.slice(-2) === "AA" ? "BB" : "AA";
  return `${header}.${body}.${signature.slice(0, -2)}${tail}`;
}

let installed = false;

/**
 * Point origin verification at a local JWKS backed by the test key.
 * Call from `beforeEach`. Idempotent per test file; unknown URLs fall through
 * to the real fetch so unrelated stubs keep working.
 */
export function installTestJwks(): void {
  vi.stubEnv("ZITADEL_ISSUER", TEST_ISSUER);
  vi.stubEnv("ZITADEL_CLIENT_ID", TEST_AUDIENCE);
  resetZitadelJwksCache();
  if (installed) return;
  installed = true;

  const originalFetch = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/.well-known/openid-configuration")) {
      return Response.json({ jwks_uri: `${TEST_ISSUER}/jwks` });
    }
    if (url === `${TEST_ISSUER}/jwks`) {
      return Response.json({ keys: [publicJwk] });
    }
    return originalFetch(input, init);
  });
}
