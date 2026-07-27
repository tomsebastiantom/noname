import { describe, expect, it } from "vitest";
import { canDraftAtEdge, primaryRoleFromKeys, rolesFromZitadelJwt } from "./jwt-roles";

describe("rolesFromZitadelJwt", () => {
  it("reads editor role from project claim", () => {
    const payload = {
      "urn:zitadel:iam:org:project:proj-1:roles": { editor: { "org-1": "Org" } },
    };
    expect(rolesFromZitadelJwt(payload, "proj-1")).toEqual(["editor"]);
    expect(primaryRoleFromKeys(["editor"])).toBe("editor");
    expect(canDraftAtEdge(["editor"])).toBe(true);
  });

  it("defaults to customer when no team roles", () => {
    expect(primaryRoleFromKeys([])).toBe("customer");
    expect(canDraftAtEdge([])).toBe(false);
  });
});
