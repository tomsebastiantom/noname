import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "./permissions";
import {
  permissionsFromJwt,
  rolesFromJwt,
  teamRoleFromJwt,
  zitadelProjectRolesClaimKey,
} from "./roles-from-jwt";

const PROJECT_ID = "proj-123";

describe("rolesFromJwt", () => {
  it("reads roles from project-scoped ZITADEL claim", () => {
    const payload = {
      sub: "user-1",
      [zitadelProjectRolesClaimKey(PROJECT_ID)]: {
        editor: { orgId: "org-1" },
      },
    };
    expect(rolesFromJwt(payload, { projectId: PROJECT_ID })).toEqual(["editor"]);
  });

  it("discovers project roles claim when projectId omitted", () => {
    const payload = {
      "urn:zitadel:iam:org:project:abc:roles": {
        admin: { orgId: "org-1" },
      },
    };
    expect(rolesFromJwt(payload)).toEqual(["admin"]);
  });

  it("ignores unknown role keys", () => {
    const payload = {
      [zitadelProjectRolesClaimKey(PROJECT_ID)]: {
        superuser: { orgId: "org-1" },
        editor: { orgId: "org-1" },
      },
    };
    expect(rolesFromJwt(payload, { projectId: PROJECT_ID })).toEqual(["editor"]);
  });

  it("expands permissions from jwt roles", () => {
    const payload = {
      [zitadelProjectRolesClaimKey(PROJECT_ID)]: {
        editor: { orgId: "org-1" },
      },
    };
    const perms = permissionsFromJwt(payload, { projectId: PROJECT_ID });
    expect(perms).toContain(PERMISSIONS.CONTENT_DRAFT_WRITE);
    expect(perms).not.toContain(PERMISSIONS.CONTENT_PUBLISH);
  });

  it("teamRoleFromJwt returns admin or editor only", () => {
    expect(
      teamRoleFromJwt(
        { [zitadelProjectRolesClaimKey(PROJECT_ID)]: { admin: {} } },
        { projectId: PROJECT_ID },
      ),
    ).toBe("admin");
    expect(
      teamRoleFromJwt(
        { [zitadelProjectRolesClaimKey(PROJECT_ID)]: { customer: {} } },
        { projectId: PROJECT_ID },
      ),
    ).toBeNull();
  });
});
