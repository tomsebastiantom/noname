import { describe, expect, it } from "vitest";
import {
  DEFAULT_TENANT_AUTH,
  enabledProviders,
  mergeAuthConfig,
  normalizeAuthConfig,
} from "./auth-config";

describe("enabledProviders", () => {
  it("returns only providers with idp ids", () => {
    const auth = mergeAuthConfig(DEFAULT_TENANT_AUTH, {
      providers: ["google", "github"],
      idpIds: { google: "idp-123" },
    });
    expect(enabledProviders(auth)).toEqual(["google"]);
  });
});

describe("normalizeAuthConfig", () => {
  it("filters unknown providers but keeps custom providers", () => {
    const auth = normalizeAuthConfig({
      providers: ["google", "unknown", "custom:okta"],
      idpIds: { google: "x", "custom:okta": "y" },
    });
    expect(auth.providers).toEqual(["google", "custom:okta"]);
  });

  it("normalizes providerIconAssets to documentId refs", () => {
    const auth = normalizeAuthConfig({
      providerIconAssets: {
        google: { documentId: "icon-1" },
        github: { documentId: "icon-2" },
      },
    });
    expect(auth.providerIconAssets).toEqual({
      google: { documentId: "icon-1" },
      github: { documentId: "icon-2" },
    });
  });

  it("drops non-canonical icon refs", () => {
    const auth = normalizeAuthConfig({
      providerIconAssets: {
        google: { assetId: "icon-legacy" },
      },
    });
    expect(auth.providerIconAssets).toEqual({});
  });
});
