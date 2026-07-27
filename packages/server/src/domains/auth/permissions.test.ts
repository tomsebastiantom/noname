import { describe, expect, it } from "vitest";
import {
  expandPermissions,
  hasPermission,
  PERMISSIONS,
  primaryTeamRole,
  ROLE_PERMISSIONS,
} from "./permissions";

describe("permissions", () => {
  it("admin role includes publish permissions", () => {
    const perms = expandPermissions(["admin"]);
    expect(perms).toContain(PERMISSIONS.CONTENT_PUBLISH);
    expect(perms).toContain(PERMISSIONS.LAYOUT_PUBLISH);
    expect(perms).toContain(PERMISSIONS.AUTH_MANAGE);
  });

  it("editor role includes draft keys but not publish", () => {
    const perms = expandPermissions(["editor"]);
    expect(perms).toContain(PERMISSIONS.CONTENT_DRAFT_WRITE);
    expect(perms).toContain(PERMISSIONS.LAYOUT_DRAFT_WRITE);
    expect(perms).not.toContain(PERMISSIONS.CONTENT_PUBLISH);
    expect(perms).not.toContain(PERMISSIONS.LAYOUT_PUBLISH);
    expect(perms).not.toContain(PERMISSIONS.AUTH_MANAGE);
  });

  it("customer role is storefront view only", () => {
    expect(expandPermissions(["customer"])).toEqual([PERMISSIONS.STOREFRONT_VIEW]);
  });

  it("expandPermissions dedupes overlapping roles", () => {
    const perms = expandPermissions(["editor", "customer"]);
    expect(perms.filter((p) => p === PERMISSIONS.STOREFRONT_VIEW)).toHaveLength(1);
    expect(perms).toContain(PERMISSIONS.CONTENT_DRAFT_WRITE);
  });

  it("hasPermission checks membership", () => {
    const perms = expandPermissions(["editor"]);
    expect(hasPermission(perms, PERMISSIONS.LAYOUT_DRAFT_WRITE)).toBe(true);
    expect(hasPermission(perms, PERMISSIONS.LAYOUT_PUBLISH)).toBe(false);
  });

  it("primaryTeamRole prefers admin over editor", () => {
    expect(primaryTeamRole(["editor", "admin"])).toBe("admin");
    expect(primaryTeamRole(["editor"])).toBe("editor");
    expect(primaryTeamRole(["customer"])).toBe("customer");
    expect(primaryTeamRole([])).toBeNull();
  });

  it("ROLE_PERMISSIONS covers every platform role", () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual(["admin", "customer", "editor"]);
  });
});
