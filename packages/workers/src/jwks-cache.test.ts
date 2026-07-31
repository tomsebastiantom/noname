import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveJwksUrl } from "./jwks-cache";

describe("resolveJwksUrl", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses jwks_uri from OpenID discovery", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/.well-known/openid-configuration")) {
          return new Response(
            JSON.stringify({ jwks_uri: "http://localhost:8080/oauth/v2/keys" }),
            { status: 200 },
          );
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    await expect(resolveJwksUrl("http://localhost:8080/")).resolves.toBe(
      "http://localhost:8080/oauth/v2/keys",
    );
  });

  it("falls back to /.well-known/jwks.json when discovery has no jwks_uri", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ issuer: "http://idp.example" }), { status: 200 })),
    );

    await expect(resolveJwksUrl("http://idp.example")).resolves.toBe(
      "http://idp.example/.well-known/jwks.json",
    );
  });
});
