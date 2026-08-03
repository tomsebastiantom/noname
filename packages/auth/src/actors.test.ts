import { describe, expect, it } from "vitest";
import { intersectAgentPermissions } from "./actors";
import { PERMISSIONS } from "./permissions";

describe("intersectAgentPermissions", () => {
  it("returns draft permissions shared with creator", () => {
    expect(
      intersectAgentPermissions([
        PERMISSIONS.CONTENT_DRAFT_WRITE,
        PERMISSIONS.CONTENT_PUBLISH,
        PERMISSIONS.AUTH_MANAGE,
      ]),
    ).toEqual([PERMISSIONS.CONTENT_DRAFT_WRITE]);
  });

  it("never grants publish or admin to agents", () => {
    expect(
      intersectAgentPermissions(
        [PERMISSIONS.CONTENT_PUBLISH, PERMISSIONS.AUTH_MANAGE],
        [PERMISSIONS.CONTENT_PUBLISH, PERMISSIONS.AUTH_MANAGE],
      ),
    ).toEqual([]);
  });
});
