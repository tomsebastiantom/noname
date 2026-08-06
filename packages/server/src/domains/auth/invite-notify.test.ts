import { describe, expect, it, vi } from "vitest";
import { createAuthService } from "./service";

vi.mock("./adapters/zitadel/authorizations", () => ({
  teamRoleAssignments: vi.fn(),
  upsertUserTeamRole: vi.fn(),
}));

vi.mock("./adapters/zitadel/users", () => ({
  inviteHumanUser: vi.fn(async () => ({ userId: "user-new-1" })),
  listOrgUsers: vi.fn(),
  findUserIdByEmail: vi.fn(),
  registerHumanUser: vi.fn(),
  passwordResetUrlTemplate: vi.fn(),
  requestPasswordResetEmail: vi.fn(),
  setPasswordWithVerificationCode: vi.fn(),
}));

vi.mock("./adapters/zitadel/project-id", () => ({
  zitadelProjectId: () => "project-1",
}));

describe("inviteTeamUser welcome notification", () => {
  it("calls notify with welcome trigger after invite", async () => {
    const notify = vi.fn(async () => ({ deliveryId: "d1", jobId: "j1" }));
    const service = createAuthService({
      tenantSettings: {
        get: vi.fn(async () => ({
          id: "ts-1",
          orgId: "org-1",
          slug: "yogastore",
          locales: ["en-US"],
          defaultLocale: "en-US",
          seo: {},
          integrations: {},
          auth: {},
        })),
        upsert: vi.fn(),
        resolveStoreSlug: vi.fn(),
      },
      assets: {} as never,
      content: { findByType: vi.fn() },
      notifications: { notify },
    });

    const result = await service.inviteTeamUser("org-1", {
      email: "new@example.com",
      givenName: "Sam",
      familyName: "Lee",
      role: "editor",
    });

    expect(result.userId).toBe("user-new-1");
    expect(notify).toHaveBeenCalledWith("org-1", {
      trigger: "welcome",
      to: "new@example.com",
      userId: "user-new-1",
      variables: { name: "Sam Lee", storeName: "yogastore" },
      idempotencyKey: "welcome:user-new-1",
    });
  });
});
