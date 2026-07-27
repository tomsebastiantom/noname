import { describe, expect, it } from "vitest";
import { canDraft, primaryRoleFromKeys } from "../permissions";
import { rolesFromTokenPayload } from "./roles";

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
});
