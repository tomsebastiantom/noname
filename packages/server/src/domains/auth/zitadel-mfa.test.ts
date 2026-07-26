import { afterEach, describe, expect, it, vi } from "vitest";
import { startTotpRegistration, userHasTotpFactor, verifyTotpRegistration } from "./zitadel-mfa";

vi.mock("./zitadel-management", () => ({
  v2Request: vi.fn(),
}));

import { v2Request } from "./zitadel-management";

describe("zitadel-mfa", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(v2Request).mockReset();
  });

  it("detects TOTP from ZITADEL otp factor shape", async () => {
    vi.mocked(v2Request).mockResolvedValue({
      result: [{ state: "AUTH_FACTOR_STATE_READY", otp: {} }],
    });
    await expect(userHasTotpFactor("org-1", "user-1")).resolves.toBe(true);
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
