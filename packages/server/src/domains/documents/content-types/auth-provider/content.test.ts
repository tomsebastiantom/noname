import { describe, expect, it } from "vitest";
import {
  buildGenericOAuthPayload,
  customProviderId,
  parseAuthProviderDisplayData,
  parseAuthProviderEntryData,
  providerIdFromKey,
} from "./content";

describe("auth-provider-content", () => {
  it("parses custom auth_provider entry fields", () => {
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
    expect(providerIdFromKey(entry.providerKey)).toBe("custom:okta");
  });

  it("parses built-in display rows without OAuth credentials", () => {
    const display = parseAuthProviderDisplayData({
      name: "Google Workspace",
      provider_key: "google",
      enabled: true,
      icon: { documentId: "icon-google" },
    });

    expect(display).toEqual({
      name: "Google Workspace",
      providerKey: "google",
      enabled: true,
    });
    expect(providerIdFromKey(display!.providerKey)).toBe("google");
  });

  it("rejects OAuth credentials on built-in CMS rows", () => {
    expect(() =>
      parseAuthProviderEntryData({
        name: "Google",
        provider_key: "google",
        client_id: "cid",
        client_secret: "sec",
        authorization_endpoint: "https://example.com/auth",
        token_endpoint: "https://example.com/token",
        user_endpoint: "https://example.com/userinfo",
      }),
    ).toThrow(/must not include OAuth credentials/i);
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
});
