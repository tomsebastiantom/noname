import { describe, expect, it } from "vitest";
import { normalizeAuthConfig, teamRoleForUser } from "./auth-config";
import { passwordResetUrlTemplate } from "./zitadel-users";

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

  it("bootstrap team role defaults to admin when no roles configured", () => {
    const auth = normalizeAuthConfig({});
    expect(teamRoleForUser(auth, "user-1")).toBe("admin");
  });

  it("assigned team role overrides bootstrap default", () => {
    const auth = normalizeAuthConfig({ teamRoles: { "user-1": "editor" } });
    expect(teamRoleForUser(auth, "user-1")).toBe("editor");
    expect(teamRoleForUser(auth, "user-2")).toBe("editor");
  });
});

describe("passwordResetUrlTemplate", () => {
  it("builds login reset link with ZITADEL template placeholders", () => {
    expect(passwordResetUrlTemplate("yogastore")).toBe(
      "http://yogastore.localhost:5173/login?userID={{.UserID}}&code={{.Code}}&orgID={{.OrgID}}",
    );
  });
});
