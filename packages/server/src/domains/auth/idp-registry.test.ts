import { describe, expect, it } from "vitest";
import { DEFAULT_TENANT_AUTH } from "./auth-config";
import { IDP_PROVIDER_IDS, publicProviderLabels, resolveIdpUpdate } from "./idp-registry";

describe("idp-registry", () => {
  it("lists all supported providers", () => {
    expect(IDP_PROVIDER_IDS).toEqual(["google", "github", "apple"]);
  });

  it("does nothing when provider not enabled", () => {
    expect(resolveIdpUpdate("google", DEFAULT_TENANT_AUTH, { providers: [] })).toEqual({
      required: false,
    });
  });

  it("requires credentials when enabled without existing idp", () => {
    expect(resolveIdpUpdate("github", DEFAULT_TENANT_AUTH, { providers: ["github"] })).toEqual({
      required: true,
    });
  });

  it("allows save when enabled and idp already stored", () => {
    const current = {
      ...DEFAULT_TENANT_AUTH,
      providers: ["google"],
      idpIds: { google: "idp-123" },
    };
    expect(resolveIdpUpdate("google", current, { providers: ["google"] })).toEqual({
      required: false,
      existingIdpId: "idp-123",
    });
  });

  it("passes oauth payload when provided", () => {
    expect(
      resolveIdpUpdate("google", DEFAULT_TENANT_AUTH, {
        providers: ["google"],
        googleOAuth: { clientId: "cid", clientSecret: "sec" },
      }),
    ).toEqual({
      required: true,
      credentials: { clientId: "cid", clientSecret: "sec" },
    });
  });

  it("builds public login labels from registry and stored names", () => {
    expect(publicProviderLabels(["google", "custom:okta"], { "custom:okta": "Okta Workforce" })).toEqual(
      {
        google: "Continue with Google",
        "custom:okta": "Continue with Okta Workforce",
      },
    );
  });
});
