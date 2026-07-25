import { describe, expect, it } from "vitest";
import { DEFAULT_TENANT_AUTH } from "./auth-config";
import { resolveGoogleIdpId } from "./resolve-google-idp";

describe("resolveGoogleIdpId", () => {
  it("does nothing when google not in providers", () => {
    expect(resolveGoogleIdpId(DEFAULT_TENANT_AUTH, { providers: [] })).toEqual({
      required: false,
    });
  });

  it("requires oauth when google enabled without existing idp", () => {
    expect(resolveGoogleIdpId(DEFAULT_TENANT_AUTH, { providers: ["google"] })).toEqual({
      required: true,
    });
  });

  it("allows save when google enabled and idp already stored", () => {
    const current = {
      ...DEFAULT_TENANT_AUTH,
      providers: ["google"],
      idpIds: { google: "idp-123" },
    };
    expect(resolveGoogleIdpId(current, { providers: ["google"] })).toEqual({
      required: false,
      existingIdpId: "idp-123",
    });
  });

  it("passes oauth payload when provided", () => {
    expect(
      resolveGoogleIdpId(DEFAULT_TENANT_AUTH, {
        providers: ["google"],
        googleOAuth: { clientId: "cid", clientSecret: "sec" },
      }),
    ).toEqual({
      required: true,
      googleOAuth: { clientId: "cid", clientSecret: "sec" },
    });
  });
});
