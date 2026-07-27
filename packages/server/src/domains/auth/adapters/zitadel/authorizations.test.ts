import { beforeEach, describe, expect, it, vi } from "vitest";
import { teamRoleAssignments, upsertUserTeamRole } from "./authorizations";

vi.mock("./management", () => ({
  connectRequest: vi.fn(),
}));

import { connectRequest } from "./management";

const connectRequestMock = vi.mocked(connectRequest);

describe("teamRoleAssignments", () => {
  beforeEach(() => {
    connectRequestMock.mockReset();
  });

  it("maps admin and editor roles for the platform project", async () => {
    connectRequestMock.mockResolvedValue({
      authorizations: [
        {
          id: "auth-1",
          user: { id: "user-admin" },
          project: { id: "proj-1" },
          organization: { id: "org-1" },
          roles: [{ key: "admin" }],
        },
        {
          id: "auth-2",
          user: { id: "user-editor" },
          project: { id: "proj-1" },
          organization: { id: "org-1" },
          roles: [{ key: "editor" }],
        },
        {
          id: "auth-3",
          user: { id: "user-other-org" },
          project: { id: "proj-1" },
          organization: { id: "org-2" },
          roles: [{ key: "admin" }],
        },
      ],
    });

    const map = await teamRoleAssignments("org-1", "proj-1");
    expect(map.get("user-admin")).toBe("admin");
    expect(map.get("user-editor")).toBe("editor");
    expect(map.has("user-other-org")).toBe(false);
  });
});

describe("upsertUserTeamRole", () => {
  beforeEach(() => {
    connectRequestMock.mockReset();
  });

  it("creates authorization when none exists", async () => {
    connectRequestMock.mockResolvedValueOnce({ authorizations: [] });
    connectRequestMock.mockResolvedValueOnce({ id: "auth-new" });

    await upsertUserTeamRole("org-1", "proj-1", "user-1", "editor");

    expect(connectRequestMock).toHaveBeenLastCalledWith(
      "org-1",
      "/zitadel.authorization.v2.AuthorizationService/CreateAuthorization",
      {
        userId: "user-1",
        projectId: "proj-1",
        organizationId: "org-1",
        roleKeys: ["editor"],
      },
    );
  });

  it("updates authorization when one exists", async () => {
    connectRequestMock.mockResolvedValueOnce({
      authorizations: [
        {
          id: "auth-1",
          user: { id: "user-1" },
          project: { id: "proj-1" },
          organization: { id: "org-1" },
          roles: [{ key: "editor" }],
        },
      ],
    });
    connectRequestMock.mockResolvedValueOnce({});

    await upsertUserTeamRole("org-1", "proj-1", "user-1", "admin");

    expect(connectRequestMock).toHaveBeenLastCalledWith(
      "org-1",
      "/zitadel.authorization.v2.AuthorizationService/UpdateAuthorization",
      {
        id: "auth-1",
        roleKeys: ["admin"],
      },
    );
  });
});
