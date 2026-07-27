import { describe, expect, it } from "vitest";
import { normalizeAuthConfig } from "../documents/tenant/auth-config";
import { passwordResetUrlTemplate } from "./adapters/zitadel/users";

describe("account flow auth config", () => {
  it("defaults allowSignUp off and allowPasswordReset on", () => {
    const auth = normalizeAuthConfig({});
    expect(auth.allowSignUp).toBe(false);
    expect(auth.allowPasswordReset).toBe(true);
  });

  it("reads allowSignUp and allowPasswordReset flags", () => {
    const auth = normalizeAuthConfig({
      allowSignUp: true,
      allowPasswordReset: false,
    });
    expect(auth.allowSignUp).toBe(true);
    expect(auth.allowPasswordReset).toBe(false);
  });

  it("reads requireMfaForAdmin flag", () => {
    const auth = normalizeAuthConfig({ requireMfaForAdmin: true });
    expect(auth.requireMfaForAdmin).toBe(true);
  });
});

describe("passwordResetUrlTemplate", () => {
  it("builds login reset link with ZITADEL template placeholders", () => {
    expect(passwordResetUrlTemplate("yogastore")).toBe(
      "http://yogastore.localhost:5173/login?userID={{.UserID}}&code={{.Code}}&orgID={{.OrgID}}",
    );
  });
});
