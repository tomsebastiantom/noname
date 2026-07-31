import { describe, expect, it, vi } from "vitest";
import { zitadelIssuer } from "./issuer";

describe("zitadelIssuer", () => {
  it("defaults to localhost when env is unset", () => {
    vi.stubEnv("ZITADEL_ISSUER", "");
    expect(zitadelIssuer()).toBe("http://localhost:8080");
  });

  it("reads ZITADEL_ISSUER from env", () => {
    vi.stubEnv("ZITADEL_ISSUER", "https://auth.example.com");
    expect(zitadelIssuer()).toBe("https://auth.example.com");
  });
});
