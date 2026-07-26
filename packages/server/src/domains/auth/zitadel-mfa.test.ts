import { afterEach, describe, expect, it, vi } from "vitest";
import { startTotpRegistration, verifyTotpRegistration } from "./zitadel-mfa";

describe("zitadel-mfa", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts TOTP registration with user token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        expect(url).toContain("/v2/users/user-1/totp");
        expect(init?.headers).toMatchObject({ Authorization: "Bearer user-jwt" });
        return Response.json({ uri: "otpauth://totp/test", secret: "SECRET123" });
      }),
    );

    const result = await startTotpRegistration("user-jwt", "user-1");
    expect(result).toEqual({ uri: "otpauth://totp/test", secret: "SECRET123" });
  });

  it("verifies TOTP registration code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        expect(url).toContain("/v2/users/user-1/totp/verify");
        expect(init?.body).toBe(JSON.stringify({ code: "123456" }));
        return Response.json({ details: {} });
      }),
    );

    await expect(verifyTotpRegistration("user-jwt", "user-1", "123456")).resolves.toBeUndefined();
  });
});
