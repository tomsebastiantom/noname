import { describe, expect, it } from "vitest";
import {
  buildGenericOAuthPayload,
  customProviderId,
  parseAuthProviderEntryData,
  parseIconAssetId,
} from "./auth-provider-content";

describe("auth-provider-content", () => {
  it("parses auth_provider entry fields", () => {
    const entry = parseAuthProviderEntryData({
      name: "Okta Workforce",
      provider_key: "okta",
      client_id: "cid",
      client_secret: "sec",
      authorization_endpoint: "https://example.com/auth",
      token_endpoint: "https://example.com/token",
      user_endpoint: "https://example.com/userinfo",
      scopes: "openid, email",
      enabled: true,
    });

    expect(entry.providerKey).toBe("okta");
    expect(entry.scopes).toEqual(["openid", "email"]);
    expect(customProviderId(entry.providerKey)).toBe("custom:okta");
  });

  it("builds ZITADEL generic OAuth payload", () => {
    const payload = buildGenericOAuthPayload({
      name: "Okta",
      providerKey: "okta",
      clientId: "cid",
      clientSecret: "sec",
      authorizationEndpoint: "https://example.com/auth",
      tokenEndpoint: "https://example.com/token",
      userEndpoint: "https://example.com/userinfo",
      scopes: ["openid"],
      enabled: true,
    });

    expect(payload.authorizationEndpoint).toBe("https://example.com/auth");
    expect(payload.usePkce).toBe(true);
  });

  it("parses optional icon asset reference", () => {
    expect(parseIconAssetId({ icon: { documentId: "asset-1" } })).toBe("asset-1");
    expect(parseIconAssetId({ icon: { assetId: "asset-1" } })).toBe("asset-1");
    expect(parseIconAssetId({})).toBeNull();
  });
});
