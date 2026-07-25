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
  it("filters unknown providers", () => {
    const auth = normalizeAuthConfig({
      providers: ["google", "unknown"],
      idpIds: { google: "x" },
    });
    expect(auth.providers).toEqual(["google"]);
  });
});
