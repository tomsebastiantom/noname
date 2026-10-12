import { describe, expect, it } from "vitest";
import { canDraft, primaryRoleFromKeys } from "../permissions";
import { allowProjectIdFallbackFromEnv, rolesFromTokenPayload } from "./roles";

describe("rolesFromTokenPayload", () => {
  it("reads editor role from project claim", () => {
    const payload = {
      "urn:zitadel:iam:org:project:proj-1:roles": { editor: { "org-1": "Org" } },
    };
    expect(rolesFromTokenPayload(payload, { projectId: "proj-1" })).toEqual(["editor"]);
    expect(primaryRoleFromKeys(["editor"])).toBe("editor");
    expect(canDraft(["editor"])).toBe(true);
  });

  it("defaults to customer when no team roles", () => {
    expect(primaryRoleFromKeys([])).toBe("customer");
    expect(canDraft([])).toBe(false);
  });

  it("does NOT fall back to another project's role claim by default", () => {
    // Regression: role NAMES are not namespaced per project, so accepting any
    // project claim let a role called `admin` in an unrelated project read as
    // the platform `admin`.
    const payload = {
      "urn:zitadel:iam:org:project:new-proj:roles": { admin: { "org-1": "Org" } },
    };
    expect(rolesFromTokenPayload(payload, { projectId: "stale-proj" })).toEqual([]);
  });

  it("falls back across project claims only when explicitly opted in", () => {
    const payload = {
      "urn:zitadel:iam:org:project:new-proj:roles": { admin: { "org-1": "Org" } },
    };
    expect(
      rolesFromTokenPayload(payload, { projectId: "stale-proj", allowProjectIdFallback: true }),
    ).toEqual(["admin"]);
  });

  it("never reads the aggregate projects-roles claim", () => {
    const payload = { "urn:zitadel:iam:org:projects:roles": ["admin"] };
    expect(rolesFromTokenPayload(payload, { projectId: "proj-1" })).toEqual([]);
    expect(
      rolesFromTokenPayload(payload, { projectId: "proj-1", allowProjectIdFallback: true }),
    ).toEqual([]);
  });
});

describe("allowProjectIdFallbackFromEnv", () => {
  it("is off unless the flag is exactly 'true'", () => {
    expect(allowProjectIdFallbackFromEnv({})).toBe(false);
    expect(allowProjectIdFallbackFromEnv({ ZITADEL_ALLOW_PROJECT_ID_FALLBACK: "1" })).toBe(false);
    expect(allowProjectIdFallbackFromEnv({ ZITADEL_ALLOW_PROJECT_ID_FALLBACK: "true" })).toBe(true);
  });

  it("cannot be enabled in production, even with the flag set", () => {
    expect(
      allowProjectIdFallbackFromEnv({
        NODE_ENV: "production",
        ZITADEL_ALLOW_PROJECT_ID_FALLBACK: "true",
      }),
    ).toBe(false);
  });
});
