import { describe, expect, it } from "vitest";
import { grantProjectIdForOrg } from "./guards";

/**
 * Regression: a platform service account holds its roles on the **platform** project. Resolving the grant lookup
 * against the tenant project produced an empty permission set, so ordinary platform routes answered 403 even
 * though `requirePlatformOperator` (which resolves the platform project explicitly) accepted the same token.
 */
describe("grantProjectIdForOrg", () => {
  const env = {
    PLATFORM_ORG_ID: "platform-org",
    ZITADEL_PLATFORM_PROJECT_ID: "platform-project",
  } as NodeJS.ProcessEnv;

  it("uses the platform project when acting for the platform org", () => {
    expect(grantProjectIdForOrg("platform-org", "tenant-project", env)).toBe("platform-project");
  });

  it("uses the tenant project for a tenant org", () => {
    expect(grantProjectIdForOrg("tenant-org", "tenant-project", env)).toBe("tenant-project");
  });

  it("falls back to the tenant project when no platform project is configured", () => {
    expect(
      grantProjectIdForOrg("platform-org", "tenant-project", {
        PLATFORM_ORG_ID: "platform-org",
      } as NodeJS.ProcessEnv),
    ).toBe("tenant-project");
  });

  it("uses the tenant project when the platform org is unset", () => {
    expect(grantProjectIdForOrg("platform-org", "tenant-project", {} as NodeJS.ProcessEnv)).toBe(
      "tenant-project",
    );
  });

  it("returns undefined when neither project is known", () => {
    expect(grantProjectIdForOrg("tenant-org", undefined, env)).toBeUndefined();
  });
});
