import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  buildServiceAccountAssertion,
  exchangeDelegatedToken,
  serviceAccountToken,
  type FetchLike,
  type ServiceAccountKey,
} from "./zitadel-token";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const key: ServiceAccountKey = {
  type: "serviceaccount",
  keyId: "key-1",
  key: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
  userId: "agent-user-42",
};
const issuer = "http://localhost:8080";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("buildServiceAccountAssertion", () => {
  it("signs iss/sub/aud/kid and verifies against the public key", () => {
    const assertion = buildServiceAccountAssertion(key, issuer, 1_700_000_000);
    const [header, payload, signature] = assertion.split(".");
    expect(JSON.parse(Buffer.from(header!, "base64url").toString())).toMatchObject({
      alg: "RS256",
      kid: "key-1",
    });
    expect(JSON.parse(Buffer.from(payload!, "base64url").toString())).toMatchObject({
      iss: "agent-user-42",
      sub: "agent-user-42",
      aud: issuer,
      iat: 1_700_000_000,
      exp: 1_700_000_300,
    });
    expect(
      verify(
        "RSA-SHA256",
        Buffer.from(`${header}.${payload}`),
        publicKey,
        Buffer.from(signature!, "base64url"),
      ),
    ).toBe(true);
  });
});

describe("serviceAccountToken", () => {
  it("posts a jwt-bearer grant and returns the access token", async () => {
    const fetchImpl = vi.fn(async () =>
      response({ access_token: "actor-token", expires_in: 300, token_type: "Bearer" }),
    ) as unknown as FetchLike;

    const result = await serviceAccountToken({ issuer, key }, fetchImpl);

    expect(result.accessToken).toBe("actor-token");
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("http://localhost:8080/oauth/v2/token");
    const body = (init as RequestInit).body as URLSearchParams;
    expect(body.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    expect(body.get("assertion")).toBeTruthy();
  });

  it("fails closed on a non-2xx response", async () => {
    const fetchImpl = vi.fn(async () => response({ error: "invalid_grant" }, 400)) as unknown as FetchLike;
    await expect(serviceAccountToken({ issuer, key }, fetchImpl)).rejects.toThrow(/HTTP 400/);
  });
});

describe("exchangeDelegatedToken", () => {
  it("sends actor, subject, requested token type and audience", async () => {
    const fetchImpl = vi.fn(async () =>
      response({ access_token: "delegated-token", expires_in: 300 }),
    ) as unknown as FetchLike;

    const result = await exchangeDelegatedToken(
      {
        issuer,
        actorToken: "actor-token",
        subjectToken: "user-token",
        scopes: "openid profile",
        audience: "noname-agents",
      },
      fetchImpl,
    );

    expect(result.accessToken).toBe("delegated-token");
    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const body = (init as RequestInit).body as URLSearchParams;
    expect(body.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:token-exchange");
    expect(body.get("actor_token")).toBe("actor-token");
    expect(body.get("subject_token")).toBe("user-token");
    expect(body.get("requested_token_type")).toBe(
      "urn:ietf:params:oauth:token-type:access_token",
    );
    expect(body.get("audience")).toBe("noname-agents");
  });

  it("fails closed when the exchange is rejected", async () => {
    const fetchImpl = vi.fn(async () => response({ error: "access_denied" }, 403)) as unknown as FetchLike;
    await expect(
      exchangeDelegatedToken(
        { issuer, actorToken: "a", subjectToken: "s" },
        fetchImpl,
      ),
    ).rejects.toThrow(/HTTP 403/);
  });
});
