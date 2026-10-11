/**
 * Regression tests for origin-side token verification.
 *
 * These exist because the API previously derived identity and permissions from
 * an unverified JWT payload (`decodeAccessTokenPayload`), while the edge could
 * forward a caller-supplied credential on routes it had not validated. A token
 * carrying `urn:zitadel:iam:org:projects:roles: ["admin"]` therefore satisfied
 * permission checks on public capability routes.
 *
 * Every case below must stay rejected.
 */

import { PERMISSIONS } from "@noname/auth";
import { Hono } from "hono";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetZitadelJwksCache } from "./adapters/zitadel/jwks";
import { requireActorPermission } from "./guards";

const ISSUER = "https://issuer.test";
const CLIENT_ID = "client-id";

interface KeyPair {
  privateKey: CryptoKey;
  publicJwk: JsonWebKey & { kid?: string };
}

let keys: KeyPair;

function b64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlJson(value: unknown): string {
  return b64url(new TextEncoder().encode(JSON.stringify(value)));
}

/** Sign a token with the test private key. */
async function signToken(payload: Record<string, unknown>): Promise<string> {
  const header = { alg: "RS256", typ: "JWT", kid: "test-kid" };
  const signingInput = `${b64urlJson(header)}.${b64urlJson(payload)}`;
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    keys.privateKey,
    new TextEncoder().encode(signingInput) as unknown as BufferSource,
  );
  return `${signingInput}.${b64url(new Uint8Array(signature))}`;
}

function baseClaims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: ISSUER,
    aud: CLIENT_ID,
    sub: "attacker",
    iat: now,
    exp: now + 3600,
    // The claim the exploit relied on: honoured with no project check.
    "urn:zitadel:iam:org:projects:roles": ["admin"],
    ...overrides,
  };
}

function probeApp(): Hono {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("orgId", "org-1");
    await next();
  });
  app.get("/probe", async (c) => {
    const actor = await requireActorPermission(c, PERMISSIONS.CONTENT_DRAFT_WRITE);
    if (actor instanceof Response) return actor;
    return c.json({ ok: true, userId: actor.userId });
  });
  return app;
}

async function callProbe(token?: string): Promise<number> {
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  const response = await probeApp().request("http://api.test/probe", { headers });
  return response.status;
}

beforeAll(async () => {
  const generated = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const publicJwk = (await crypto.subtle.exportKey("jwk", generated.publicKey)) as JsonWebKey & {
    kid?: string;
  };
  publicJwk.kid = "test-kid";
  keys = { privateKey: generated.privateKey, publicJwk };
});

beforeEach(() => {
  resetZitadelJwksCache();
  vi.stubEnv("ZITADEL_ISSUER", ISSUER);
  vi.stubEnv("ZITADEL_CLIENT_ID", CLIENT_ID);
  vi.stubEnv("AGENT_TOKEN_SECRET", "test-agent-secret");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/.well-known/openid-configuration")) {
        return Response.json({ jwks_uri: `${ISSUER}/jwks` });
      }
      if (url === `${ISSUER}/jwks`) {
        return Response.json({ keys: [keys.publicJwk] });
      }
      return new Response("not found", { status: 404 });
    }),
  );
});

describe("origin-side access token verification", () => {
  it("accepts a properly signed token and grants its role permissions", async () => {
    const token = await signToken(baseClaims());
    expect(await callProbe(token)).toBe(200);
  });

  it("rejects an unsigned token that claims the admin project role (the reported exploit)", async () => {
    // alg:none, no signature — previously trusted because the payload was only base64-decoded.
    const header = b64urlJson({ alg: "none", typ: "JWT" });
    const payload = b64urlJson(baseClaims());
    expect(await callProbe(`${header}.${payload}.`)).toBe(401);
  });

  it("rejects a token whose signature was tampered with", async () => {
    const token = await signToken(baseClaims());
    const [header, payload, signature] = token.split(".") as [string, string, string];
    const flipped = `${signature.slice(0, -2)}${signature.slice(-2) === "AA" ? "BB" : "AA"}`;
    expect(await callProbe(`${header}.${payload}.${flipped}`)).toBe(401);
  });

  it("rejects a token signed by a different key", async () => {
    const other = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    );
    const header = b64urlJson({ alg: "RS256", typ: "JWT", kid: "test-kid" });
    const signingInput = `${header}.${b64urlJson(baseClaims())}`;
    const signature = await crypto.subtle.sign(
      { name: "RSASSA-PKCS1-v1_5" },
      other.privateKey,
      new TextEncoder().encode(signingInput) as unknown as BufferSource,
    );
    expect(await callProbe(`${signingInput}.${b64url(new Uint8Array(signature))}`)).toBe(401);
  });

  it("rejects an expired token even when correctly signed", async () => {
    const token = await signToken(baseClaims({ exp: Math.floor(Date.now() / 1000) - 3600 }));
    expect(await callProbe(token)).toBe(401);
  });

  it("rejects a correctly signed token from a different issuer", async () => {
    const token = await signToken(baseClaims({ iss: "https://evil.test" }));
    expect(await callProbe(token)).toBe(401);
  });

  it("rejects a correctly signed token for a different audience", async () => {
    const token = await signToken(baseClaims({ aud: "other-client" }));
    expect(await callProbe(token)).toBe(401);
  });

  it("accepts a token whose audience list contains the project id but not the client id", async () => {
    // Regression: ZITADEL access tokens carry several audiences. Accepting only
    // the client id rejected every real token once a stale duplicate of
    // ZITADEL_CLIENT_ID diverged from the issuer in packages/server/.env.
    vi.stubEnv("ZITADEL_PROJECT_ID", "project-42");
    const token = await signToken(baseClaims({ aud: ["resource-owner", "project-42"] }));
    expect(await callProbe(token)).toBe(200);
  });

  it("rejects a token whose audience matches none of our identifiers", async () => {
    vi.stubEnv("ZITADEL_PROJECT_ID", "project-42");
    const token = await signToken(baseClaims({ aud: ["resource-owner", "someone-else"] }));
    expect(await callProbe(token)).toBe(401);
  });

  it("rejects a garbage bearer token", async () => {
    expect(await callProbe("not-a-jwt")).toBe(401);
  });

  it("rejects an anonymous request", async () => {
    expect(await callProbe()).toBe(401);
  });
});
