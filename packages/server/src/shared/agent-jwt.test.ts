import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyZitadelAgentToken } from "./agent-jwt";

/**
 * Local IdP fixture: an RSA key pair, a JWKS resolver and a token builder. No network, no ZITADEL dependency —
 * the verifier contract is what is tested here.
 */
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = publicKey.export({ format: "jwk" }) as JsonWebKey;
const issuer = "http://localhost:8080";
const audience = "noname-agents";

function base64url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

function token(payload: Record<string, unknown>, kid = "test-key"): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid }));
  const body = base64url(JSON.stringify(payload));
  const signature = sign("RSA-SHA256", Buffer.from(`${header}.${body}`), privateKey);
  return `${header}.${body}.${base64url(signature)}`;
}

function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: issuer,
    aud: audience,
    sub: "user-alice",
    iat: now,
    exp: now + 300,
    jti: "token-jti-1",
    client_id: "agent-exchange-client",
    "urn:zitadel:iam:org:id": "org-1",
    "urn:zitadel:iam:org:project:roles": { editor: { "org-1": "org" } },
    act: { iss: issuer, sub: "agent-user-42" },
    ...overrides,
  };
}

const resolveKey = async () => jwk;
const options = {
  issuer,
  audience,
  resolveKey,
  expectedOrgId: "org-1",
  clientId: "agent-exchange-client",
  maxLifetimeSeconds: 900,
};

describe("verifyZitadelAgentToken", () => {
  it("returns the agent, the subject and the expanded permissions", async () => {
    const verified = await verifyZitadelAgentToken(token(payload()), options);

    expect(verified).toMatchObject({
      agentUserId: "agent-user-42",
      onBehalfOf: "user-alice",
      orgId: "org-1",
    });
    expect(verified?.permissions).toContain("layout:draft_write");
  });

  it("rejects a token without the act claim (no agent identity)", async () => {
    expect(await verifyZitadelAgentToken(token(payload({ act: undefined })), options)).toBeNull();
  });

  it("rejects a token whose act.sub is not a string", async () => {
    expect(
      await verifyZitadelAgentToken(
        token(payload({ act: { iss: issuer, sub: 42 } })),
        options,
      ),
    ).toBeNull();
  });

  it("rejects an act claim issued by a different issuer", async () => {
    expect(
      await verifyZitadelAgentToken(
        token(payload({ act: { iss: "https://evil.example", sub: "agent-user-42" } })),
        options,
      ),
    ).toBeNull();
  });

  it("rejects a token issued to a different client", async () => {
    expect(
      await verifyZitadelAgentToken(token(payload({ client_id: "other-client" })), options),
    ).toBeNull();
  });

  it("rejects a token whose lifetime exceeds the limit", async () => {
    const now = Math.floor(Date.now() / 1000);
    expect(
      await verifyZitadelAgentToken(
        token(payload({ iat: now, exp: now + 3600 })),
        options,
      ),
    ).toBeNull();
  });

  it("rejects a wrong audience", async () => {
    expect(await verifyZitadelAgentToken(token(payload({ aud: "other" })), options)).toBeNull();
  });

  it("rejects an expired token", async () => {
    expect(
      await verifyZitadelAgentToken(
        token(payload({ exp: Math.floor(Date.now() / 1000) - 10 })),
        options,
      ),
    ).toBeNull();
  });

  it("rejects the wrong org", async () => {
    expect(
      await verifyZitadelAgentToken(token(payload({ "urn:zitadel:iam:org:id": "org-2" })), options),
    ).toBeNull();
  });

  it("falls back to userinfo when the token carries no role claim", async () => {
    const tokenWithoutRoles = token(
      payload({
        "urn:zitadel:iam:org:project:roles": undefined,
        "urn:zitadel:iam:org:id": undefined,
      }),
    );
    const userInfo = async () => ({
      "urn:zitadel:iam:org:project:roles": { editor: { "org-1": "org" } },
    });

    const verified = await verifyZitadelAgentToken(tokenWithoutRoles, {
      ...options,
      userInfo,
    });

    expect(verified).toMatchObject({ orgId: "org-1", onBehalfOf: "user-alice" });
    expect(verified?.permissions).toContain("layout:draft_write");
  });

  it("rejects a token with no known role (no permissions)", async () => {
    expect(
      await verifyZitadelAgentToken(
        token(payload({ "urn:zitadel:iam:org:project:roles": { unknown: {} } })),
        options,
      ),
    ).toBeNull();
  });

  it("rejects a tampered signature", async () => {
    const valid = token(payload());
    const tampered = `${valid.slice(0, -2)}xx`;
    expect(await verifyZitadelAgentToken(tampered, options)).toBeNull();
  });
});
